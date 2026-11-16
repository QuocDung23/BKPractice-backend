import { Injectable } from '@nestjs/common';

import type { IListManagedQuizzesPortIn } from '@/modules/quizzes/application/ports/in/list-managed-quizzes.port.in';
import { QuizRepository } from '@/modules/quizzes/application/ports/out';
import { toManagedQuiz } from '@/modules/quizzes/application/results';
import { QuizAuthorizationService } from '@/modules/quizzes/application/services/quiz-authorization.service';
import type { Page, PageQuery, Principal } from '@/modules/quizzes/domain';
@Injectable()
export class ListManagedQuizzesUseCase implements IListManagedQuizzesPortIn {
  constructor(
    private readonly authorization: QuizAuthorizationService,
    private readonly quizzes: QuizRepository,
  ) {}
  async execute(p: Principal, query: PageQuery): Promise<Page<ReturnType<typeof toManagedQuiz>>> {
    this.authorization.requirePermission(p, 'quiz:read-managed');
    const page = await this.quizzes.list(p, query);
    return { ...page, items: page.items.map((q) => toManagedQuiz(q, p)) };
  }
}
