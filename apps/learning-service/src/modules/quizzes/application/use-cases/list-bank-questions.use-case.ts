import { Injectable } from '@nestjs/common';

import type { IListBankQuestionsPortIn } from '@/modules/quizzes/application/ports/in/list-bank-questions.port.in';
import { QuestionRepository } from '@/modules/quizzes/application/ports/out';
import { toManagedQuestion } from '@/modules/quizzes/application/results';
import { QuizAuthorizationService } from '@/modules/quizzes/application/services/quiz-authorization.service';
import type { Page, PageQuery, Principal } from '@/modules/quizzes/domain';
@Injectable()
export class ListBankQuestionsUseCase implements IListBankQuestionsPortIn {
  constructor(
    private readonly authorization: QuizAuthorizationService,
    private readonly questions: QuestionRepository,
  ) {}
  async execute(
    p: Principal,
    query: PageQuery,
  ): Promise<Page<ReturnType<typeof toManagedQuestion>>> {
    this.authorization.requirePermission(p, 'question:read-managed');
    const page = await this.questions.list(p, query);
    return { ...page, items: page.items.map((q) => toManagedQuestion(q, p)) };
  }
}
