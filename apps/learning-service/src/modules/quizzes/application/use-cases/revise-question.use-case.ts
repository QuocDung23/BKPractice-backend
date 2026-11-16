import { Inject, Injectable } from '@nestjs/common';

import type { TransactionRunner } from '@/modules/problems/application/ports/out';
import type { QuestionInput } from '@/modules/quizzes/application/commands';
import type { IReviseQuestionPortIn } from '@/modules/quizzes/application/ports/in/revise-question.port.in';
import { BankTaxonomyReader, QuestionRepository } from '@/modules/quizzes/application/ports/out';
import { toManagedQuestion } from '@/modules/quizzes/application/results';
import { toQuestionContent } from '@/modules/quizzes/application/services/command.utils';
import { QuizAuthorizationService } from '@/modules/quizzes/application/services/quiz-authorization.service';
import type { Principal } from '@/modules/quizzes/domain';
import { QuizError } from '@/modules/quizzes/domain';
import { QUIZ_TRANSACTION_RUNNER } from '@/modules/quizzes/quiz.tokens';
@Injectable()
export class ReviseQuestionUseCase implements IReviseQuestionPortIn {
  constructor(
    private readonly authorization: QuizAuthorizationService,
    private readonly questions: QuestionRepository,
    private readonly taxonomy: BankTaxonomyReader,
    @Inject(QUIZ_TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
  ) {}
  async execute(
    p: Principal,
    id: string,
    command: QuestionInput,
  ): Promise<ReturnType<typeof toManagedQuestion>> {
    this.authorization.requirePermission(p, 'question:update');
    const q = await this.tx.run(async () => {
      const q = await this.questions.find(id, true);
      if (!q) throw new QuizError('NOT_FOUND', 'Question not found');
      this.authorization.requireOwner(p, q.state);
      if (q.state.deletedAt) throw new QuizError('CONFLICT', 'Question is deleted');
      await this.taxonomy.validate(command.topicIds, command.tagIds);
      q.revise(toQuestionContent(command));
      await this.questions.save(q);
      return q;
    });
    return toManagedQuestion(q, p);
  }
}
