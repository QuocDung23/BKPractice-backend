import { Injectable } from '@nestjs/common';

import type { IListQuestionUsagePortIn } from '@/modules/quizzes/application/ports/in/list-question-usage.port.in';
import { QuestionRepository } from '@/modules/quizzes/application/ports/out';
import { QuizAuthorizationService } from '@/modules/quizzes/application/services/quiz-authorization.service';
import type { Principal } from '@/modules/quizzes/domain';
import { QuizError } from '@/modules/quizzes/domain';
@Injectable()
export class ListQuestionUsageUseCase implements IListQuestionUsagePortIn {
  constructor(
    private readonly authorization: QuizAuthorizationService,
    private readonly questions: QuestionRepository,
  ) {}
  async execute(p: Principal, id: string): Promise<{ id: string; title: string }[]> {
    this.authorization.requirePermission(p, 'question:read-managed');
    const q = await this.questions.find(id);
    if (!q) throw new QuizError('NOT_FOUND', 'Question not found');
    this.authorization.requireQuestionUse(p, q.state, q.sharedWith);
    return this.questions.usage(id, p);
  }
}
