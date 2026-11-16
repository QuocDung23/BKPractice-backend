import { Inject, Injectable } from '@nestjs/common';

import type { TransactionRunner } from '@/modules/problems/application/ports/out';
import type { IUpdateQuizDraftPortIn } from '@/modules/quizzes/application/ports/in/update-quiz-draft.port.in';
import { QuizRepository } from '@/modules/quizzes/application/ports/out';
import { toManagedQuiz } from '@/modules/quizzes/application/results';
import { QuizAuthorizationService } from '@/modules/quizzes/application/services/quiz-authorization.service';
import type { Principal } from '@/modules/quizzes/domain';
import { QuizError, validateText } from '@/modules/quizzes/domain';
import { QUIZ_TRANSACTION_RUNNER } from '@/modules/quizzes/quiz.tokens';
@Injectable()
export class UpdateQuizDraftUseCase implements IUpdateQuizDraftPortIn {
  constructor(
    private readonly authorization: QuizAuthorizationService,
    private readonly quizzes: QuizRepository,
    @Inject(QUIZ_TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
  ) {}
  async execute(
    p: Principal,
    id: string,
    command: { title?: string; description?: string | null },
  ): Promise<ReturnType<typeof toManagedQuiz>> {
    this.authorization.requirePermission(p, 'quiz:update');
    const q = await this.tx.run(async () => {
      const q = await this.quizzes.find(id, true);
      if (!q) throw new QuizError('NOT_FOUND', 'Quiz not found');
      this.authorization.requireOwner(p, q.state);
      const draft = q.openDraft();
      if (command.title !== undefined) draft.title = validateText(command.title, 200, 'title');
      if (command.description !== undefined)
        draft.description =
          command.description === null
            ? null
            : validateText(command.description, 20000, 'description', true);
      await this.quizzes.save(q);
      return q;
    });
    return toManagedQuiz(q, p);
  }
}
