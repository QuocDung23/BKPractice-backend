import { Injectable } from '@nestjs/common';

import type { IGetMyQuizCompletionPortIn } from '@/modules/quizzes/application/ports/in/get-my-quiz-completion.port.in';
import {
  QuizAttemptRepository,
  QuizCourseAccessReader,
} from '@/modules/quizzes/application/ports/out';
import type { Principal } from '@/modules/quizzes/domain';
import { QuizError } from '@/modules/quizzes/domain';
@Injectable()
export class GetMyQuizCompletionUseCase implements IGetMyQuizCompletionPortIn {
  constructor(
    private readonly attempts: QuizAttemptRepository,
    private readonly access: QuizCourseAccessReader,
  ) {}
  async execute(
    p: Principal,
    id: string,
  ): Promise<{ completed: boolean; bestPercentage: number; passedRevisionId: string | null }> {
    const result = await this.attempts.completed(p.userId, id);
    if (!result.completed && !(await this.access.isVisible(id)))
      throw new QuizError('NOT_FOUND', 'Quiz not available');
    return result;
  }
}
