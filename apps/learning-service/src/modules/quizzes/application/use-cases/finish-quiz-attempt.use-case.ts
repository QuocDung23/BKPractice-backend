import { Inject, Injectable } from '@nestjs/common';

import type { TransactionRunner } from '@/modules/problems/application/ports/out';
import type { IFinishQuizAttemptPortIn } from '@/modules/quizzes/application/ports/in/finish-quiz-attempt.port.in';
import { QuizAttemptRepository } from '@/modules/quizzes/application/ports/out';
import { toSummary } from '@/modules/quizzes/application/results';
import type { Principal } from '@/modules/quizzes/domain';
import { QuizError } from '@/modules/quizzes/domain';
import { QUIZ_TRANSACTION_RUNNER } from '@/modules/quizzes/quiz.tokens';
@Injectable()
export class FinishQuizAttemptUseCase implements IFinishQuizAttemptPortIn {
  constructor(
    private readonly attempts: QuizAttemptRepository,
    @Inject(QUIZ_TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
  ) {}
  async execute(p: Principal, id: string): Promise<ReturnType<typeof toSummary>> {
    const a = await this.tx.run(async () => {
      const a = await this.attempts.find(id, p.userId, true);
      if (!a) throw new QuizError('NOT_FOUND', 'Attempt not found');
      a.finish();
      await this.attempts.save(a);
      return a;
    });
    return toSummary(a);
  }
}
