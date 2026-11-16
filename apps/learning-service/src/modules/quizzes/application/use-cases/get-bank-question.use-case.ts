import { Injectable } from '@nestjs/common';

import type { IGetBankQuestionPortIn } from '@/modules/quizzes/application/ports/in/get-bank-question.port.in';
import { QuestionRepository } from '@/modules/quizzes/application/ports/out';
import { toManagedQuestion } from '@/modules/quizzes/application/results';
import { QuizAuthorizationService } from '@/modules/quizzes/application/services/quiz-authorization.service';
import type { Principal } from '@/modules/quizzes/domain';
import { QuizError } from '@/modules/quizzes/domain';
@Injectable()
export class GetBankQuestionUseCase implements IGetBankQuestionPortIn {
  constructor(
    private readonly authorization: QuizAuthorizationService,
    private readonly questions: QuestionRepository,
  ) {}
  async execute(p: Principal, id: string): Promise<ReturnType<typeof toManagedQuestion>> {
    this.authorization.requirePermission(p, 'question:read-managed');
    const q = await this.questions.find(id);
    if (!q) throw new QuizError('NOT_FOUND', 'Question not found');
    this.authorization.requireQuestionUse(p, q.state, q.sharedWith);
    return toManagedQuestion(q, p);
  }
}
