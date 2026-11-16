import { Inject, Injectable } from '@nestjs/common';

import type { TransactionRunner } from '@/modules/problems/application/ports/out';
import type { CreateQuestionCommand } from '@/modules/quizzes/application/commands';
import type { ICreateQuestionPortIn } from '@/modules/quizzes/application/ports/in/create-question.port.in';
import { BankTaxonomyReader, QuestionRepository } from '@/modules/quizzes/application/ports/out';
import { toManagedQuestion } from '@/modules/quizzes/application/results';
import {
  hashCommand,
  toQuestionContent,
} from '@/modules/quizzes/application/services/command.utils';
import { QuizAuthorizationService } from '@/modules/quizzes/application/services/quiz-authorization.service';
import type { Principal } from '@/modules/quizzes/domain';
import { Question, QuizError } from '@/modules/quizzes/domain';
import { QUIZ_TRANSACTION_RUNNER } from '@/modules/quizzes/quiz.tokens';
@Injectable()
export class CreateQuestionUseCase implements ICreateQuestionPortIn {
  constructor(
    private readonly authorization: QuizAuthorizationService,
    private readonly questions: QuestionRepository,
    private readonly taxonomy: BankTaxonomyReader,
    @Inject(QUIZ_TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
  ) {}
  async execute(
    p: Principal,
    command: CreateQuestionCommand,
  ): Promise<ReturnType<typeof toManagedQuestion>> {
    this.authorization.requirePermission(p, 'question:create');
    const hash = hashCommand(command);
    const q = await this.tx.run(async () => {
      await this.questions.lockRequest(p.userId, command.clientRequestId);
      const old = await this.questions.findRequest(p.userId, command.clientRequestId);
      if (old) {
        if (old.state.requestHash !== hash)
          throw new QuizError('CONFLICT', 'Request id reused with another payload');
        return old;
      }
      await this.taxonomy.validate(command.topicIds, command.tagIds);
      const q = Question.create(
        p.userId,
        command.clientRequestId,
        hash,
        toQuestionContent(command),
        command.isPrivate ?? false,
      );
      await this.questions.save(q);
      return q;
    });
    return toManagedQuestion(q, p);
  }
}
