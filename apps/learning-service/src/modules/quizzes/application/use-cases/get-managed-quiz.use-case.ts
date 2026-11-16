import { Injectable } from '@nestjs/common';

import type { IGetManagedQuizPortIn } from '@/modules/quizzes/application/ports/in/get-managed-quiz.port.in';
import { QuizRepository } from '@/modules/quizzes/application/ports/out';
import { toManagedQuiz } from '@/modules/quizzes/application/results';
import { QuizAuthorizationService } from '@/modules/quizzes/application/services/quiz-authorization.service';
import type { Principal } from '@/modules/quizzes/domain';
import { QuizError } from '@/modules/quizzes/domain';
@Injectable()
export class GetManagedQuizUseCase implements IGetManagedQuizPortIn {
  constructor(
    private readonly authorization: QuizAuthorizationService,
    private readonly quizzes: QuizRepository,
  ) {}
  async execute(p: Principal, id: string): Promise<ReturnType<typeof toManagedQuiz>> {
    this.authorization.requirePermission(p, 'quiz:read-managed');
    const q = await this.quizzes.find(id);
    if (!q) throw new QuizError('NOT_FOUND', 'Quiz not found');
    this.authorization.requireUse(p, q.state, q.sharedWith);
    if (
      q.state.createdBy !== p.userId &&
      !p.roles.includes('ADMIN') &&
      q.state.status !== 'PUBLISHED'
    )
      throw new QuizError('NOT_FOUND', 'Quiz not published');
    return toManagedQuiz(q, p);
  }
}
