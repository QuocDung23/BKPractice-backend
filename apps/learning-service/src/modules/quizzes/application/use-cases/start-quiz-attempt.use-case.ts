import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import type { TransactionRunner } from '@/modules/problems/application/ports/out';
import type { IStartQuizAttemptPortIn } from '@/modules/quizzes/application/ports/in/start-quiz-attempt.port.in';
import {
  QuestionRepository,
  QuizAttemptRepository,
  QuizCourseAccessReader,
  QuizRepository,
} from '@/modules/quizzes/application/ports/out';
import { toLearnerAttempt } from '@/modules/quizzes/application/results';
import type { Principal } from '@/modules/quizzes/domain';
import { QuizAttempt, QuizError, requireValue } from '@/modules/quizzes/domain';
import { QUIZ_TRANSACTION_RUNNER } from '@/modules/quizzes/quiz.tokens';

@Injectable()
export class StartQuizAttemptUseCase implements IStartQuizAttemptPortIn {
  constructor(
    private readonly questions: QuestionRepository,
    private readonly quizzes: QuizRepository,
    private readonly attempts: QuizAttemptRepository,
    private readonly access: QuizCourseAccessReader,
    @Inject(QUIZ_TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
  ) {}
  async execute(p: Principal, id: string): Promise<ReturnType<typeof toLearnerAttempt>> {
    const attempt = await this.tx.run(async () => {
      await this.attempts.lockStart(p.userId, id);
      const active = await this.attempts.active(p.userId, id);
      if (active) return active;
      const q = await this.quizzes.find(id, true);
      if (!q?.published || !(await this.access.isVisible(id)))
        throw new QuizError('NOT_FOUND', 'Quiz not available');
      const found = await this.questions.revisions(
        q.published.items.map((i) => i.questionRevisionId),
      );
      const questions = q.published.items.map((i) =>
        found.find((r) => r.id === i.questionRevisionId)!,
      );
      requireValue(questions.length > 0, 'Quiz is empty');
      const a = new QuizAttempt(
        {
          id: randomUUID(),
          quizId: id,
          quizRevisionId: q.published.id,
          userId: p.userId,
          status: 'IN_PROGRESS',
          totalQuestions: questions.length,
          correctCount: null,
          passed: null,
          startedAt: new Date(),
          finishedAt: null,
        },
        questions,
      );
      await this.attempts.save(a);
      return a;
    });
    return toLearnerAttempt(attempt);
  }
}
