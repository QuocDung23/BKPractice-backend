import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import type { TransactionRunner } from '@/modules/problems/application/ports/out';
import type { ICloneQuestionPortIn } from '@/modules/quizzes/application/ports/in/clone-question.port.in';
import { QuestionRepository } from '@/modules/quizzes/application/ports/out';
import { toManagedQuestion } from '@/modules/quizzes/application/results';
import { hashCommand } from '@/modules/quizzes/application/services/command.utils';
import { QuizAuthorizationService } from '@/modules/quizzes/application/services/quiz-authorization.service';
import type { Principal } from '@/modules/quizzes/domain';
import { Question, QuizError } from '@/modules/quizzes/domain';
import { QUIZ_TRANSACTION_RUNNER } from '@/modules/quizzes/quiz.tokens';

@Injectable()
export class CloneQuestionUseCase implements ICloneQuestionPortIn {
  constructor(
    private readonly authorization: QuizAuthorizationService,
    private readonly questions: QuestionRepository,
    @Inject(QUIZ_TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
  ) {}
  async execute(
    p: Principal,
    id: string,
    clientRequestId: string,
  ): Promise<ReturnType<typeof toManagedQuestion>> {
    this.authorization.requirePermission(p, 'question:clone');
    const hash = hashCommand({ sourceId: id });
    const q = await this.tx.run(async () => {
      await this.questions.lockRequest(p.userId, clientRequestId);
      const old = await this.questions.findRequest(p.userId, clientRequestId);
      if (old) {
        if (old.state.requestHash !== hash) throw new QuizError('CONFLICT', 'Request id reused');
        return old;
      }
      const source = await this.questions.find(id, true);
      if (!source) throw new QuizError('NOT_FOUND', 'Question not found');
      this.authorization.requireQuestionUse(p, source.state, source.sharedWith);
      const copy = Question.create(
        p.userId,
        clientRequestId,
        hash,
        {
          ...source.revision,
          options: source.revision.options.map((o) => ({ ...o, id: randomUUID() })),
        },
        true,
      );
      await this.questions.save(copy);
      return copy;
    });
    return toManagedQuestion(q, p);
  }
}
