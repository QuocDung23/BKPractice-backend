import { Inject, Injectable } from '@nestjs/common';

import type { TransactionRunner } from '@/modules/problems/application/ports/out';
import type { IRestoreQuestionPortIn } from '@/modules/quizzes/application/ports/in/restore-question.port.in';
import { QuestionRepository } from '@/modules/quizzes/application/ports/out';
import { toManagedQuestion } from '@/modules/quizzes/application/results';
import { QuizAuthorizationService } from '@/modules/quizzes/application/services/quiz-authorization.service';
import type { Principal } from '@/modules/quizzes/domain';
import { QuizError } from '@/modules/quizzes/domain';
import { QUIZ_TRANSACTION_RUNNER } from '@/modules/quizzes/quiz.tokens';
@Injectable()
export class RestoreQuestionUseCase implements IRestoreQuestionPortIn {
  constructor(
    private readonly authorization: QuizAuthorizationService,
    private readonly questions: QuestionRepository,
    @Inject(QUIZ_TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
  ) {}
  async execute(p: Principal, id: string): Promise<ReturnType<typeof toManagedQuestion>> {
    this.authorization.requirePermission(p, 'question:restore');
    const q = await this.tx.run(async () => {
      const q = await this.questions.find(id, true);
      if (!q) throw new QuizError('NOT_FOUND', 'Content not found');
      this.authorization.requireOwner(p, q.state);
      q.restore();
      await this.questions.save(q);
      return q;
    });
    return toManagedQuestion(q, p);
  }
}
