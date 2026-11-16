import { Inject, Injectable } from '@nestjs/common';

import type { TransactionRunner } from '@/modules/problems/application/ports/out';
import type { IRestoreQuizPortIn } from '@/modules/quizzes/application/ports/in/restore-quiz.port.in';
import { QuizRepository } from '@/modules/quizzes/application/ports/out';
import { toManagedQuiz } from '@/modules/quizzes/application/results';
import { QuizAuthorizationService } from '@/modules/quizzes/application/services/quiz-authorization.service';
import type { Principal } from '@/modules/quizzes/domain';
import { QuizError } from '@/modules/quizzes/domain';
import { QUIZ_TRANSACTION_RUNNER } from '@/modules/quizzes/quiz.tokens';
@Injectable()
export class RestoreQuizUseCase implements IRestoreQuizPortIn {
  constructor(
    private readonly authorization: QuizAuthorizationService,
    private readonly quizzes: QuizRepository,
    @Inject(QUIZ_TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
  ) {}
  async execute(p: Principal, id: string): Promise<ReturnType<typeof toManagedQuiz>> {
    this.authorization.requirePermission(p, 'quiz:restore');
    const q = await this.tx.run(async () => {
      const q = await this.quizzes.find(id, true);
      if (!q) throw new QuizError('NOT_FOUND', 'Content not found');
      this.authorization.requireOwner(p, q.state);
      q.restore();
      await this.quizzes.save(q);
      return q;
    });
    return toManagedQuiz(q, p);
  }
}
