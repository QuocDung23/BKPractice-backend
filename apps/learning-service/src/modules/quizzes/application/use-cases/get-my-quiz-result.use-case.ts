import { Injectable } from '@nestjs/common';

import type { IGetMyQuizResultPortIn } from '@/modules/quizzes/application/ports/in/get-my-quiz-result.port.in';
import { QuizAttemptRepository } from '@/modules/quizzes/application/ports/out';
import { toLearnerAttempt } from '@/modules/quizzes/application/results';
import type { Principal } from '@/modules/quizzes/domain';
import { QuizError } from '@/modules/quizzes/domain';
@Injectable()
export class GetMyQuizResultUseCase implements IGetMyQuizResultPortIn {
  constructor(private readonly attempts: QuizAttemptRepository) {}
  async execute(p: Principal, id: string): Promise<ReturnType<typeof toLearnerAttempt>> {
    const a = await this.attempts.find(id, p.userId);
    if (!a) throw new QuizError('NOT_FOUND', 'Attempt not found');
    if (a.state.status !== 'FINISHED') throw new QuizError('CONFLICT', 'Attempt is not finished');
    return toLearnerAttempt(a);
  }
}
