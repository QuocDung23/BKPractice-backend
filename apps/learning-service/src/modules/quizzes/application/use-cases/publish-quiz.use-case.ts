import { Inject, Injectable } from '@nestjs/common';

import type { TransactionRunner } from '@/modules/problems/application/ports/out';
import type { IPublishQuizPortIn } from '@/modules/quizzes/application/ports/in/publish-quiz.port.in';
import { QuestionRepository, QuizRepository } from '@/modules/quizzes/application/ports/out';
import { toManagedQuiz } from '@/modules/quizzes/application/results';
import { QuizAuthorizationService } from '@/modules/quizzes/application/services/quiz-authorization.service';
import type { Principal } from '@/modules/quizzes/domain';
import { QuizError } from '@/modules/quizzes/domain';
import { QUIZ_TRANSACTION_RUNNER } from '@/modules/quizzes/quiz.tokens';
@Injectable()
export class PublishQuizUseCase implements IPublishQuizPortIn {
  constructor(
    private readonly authorization: QuizAuthorizationService,
    private readonly questions: QuestionRepository,
    private readonly quizzes: QuizRepository,
    @Inject(QUIZ_TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
  ) {}
  async execute(p: Principal, id: string): Promise<ReturnType<typeof toManagedQuiz>> {
    this.authorization.requirePermission(p, 'quiz:publish');
    const q = await this.tx.run(async () => {
      const q = await this.quizzes.find(id, true);
      if (!q) throw new QuizError('NOT_FOUND', 'Quiz not found');
      this.authorization.requireOwner(p, q.state);
      const draft = q.draft;
      if (!draft) throw new QuizError('CONFLICT', 'No editable draft');
      for (const item of [...draft.items].sort((a, b) =>
        a.questionId.localeCompare(b.questionId),
      )) {
        const question = await this.questions.find(item.questionId, true);
        if (!question) throw new QuizError('INVALID', 'Question unavailable');
        this.authorization.requireQuestionUse(p, question.state, question.sharedWith);
      }
      q.publish();
      await this.quizzes.save(q);
      return q;
    });
    return toManagedQuiz(q, p);
  }
}
