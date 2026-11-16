import { Injectable } from '@nestjs/common';

import type { IListMyQuizAttemptsPortIn } from '@/modules/quizzes/application/ports/in/list-my-quiz-attempts.port.in';
import { QuizAttemptRepository } from '@/modules/quizzes/application/ports/out';
import { toLearnerAttempt } from '@/modules/quizzes/application/results';
import type { Page, PageQuery, Principal } from '@/modules/quizzes/domain';
@Injectable()
export class ListMyQuizAttemptsUseCase implements IListMyQuizAttemptsPortIn {
  constructor(private readonly attempts: QuizAttemptRepository) {}
  async execute(
    p: Principal,
    query: PageQuery,
  ): Promise<Page<ReturnType<typeof toLearnerAttempt>>> {
    const page = await this.attempts.list(p.userId, query);
    return { ...page, items: page.items.map(toLearnerAttempt) };
  }
}
