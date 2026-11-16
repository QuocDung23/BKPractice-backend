import { Injectable } from '@nestjs/common';

import type { IGetMyQuizAttemptPortIn } from '@/modules/quizzes/application/ports/in/get-my-quiz-attempt.port.in';
import { QuizAttemptRepository } from '@/modules/quizzes/application/ports/out';
import { toLearnerAttempt } from '@/modules/quizzes/application/results';
import type { Principal } from '@/modules/quizzes/domain';
import { QuizError } from '@/modules/quizzes/domain';
@Injectable()
export class GetMyQuizAttemptUseCase implements IGetMyQuizAttemptPortIn {
  constructor(private readonly attempts: QuizAttemptRepository) {}
  async execute(p: Principal, id: string): Promise<ReturnType<typeof toLearnerAttempt>> {
    const a = await this.attempts.find(id, p.userId);
    if (!a) throw new QuizError('NOT_FOUND', 'Attempt not found');
    return toLearnerAttempt(a);
  }
}
