import { Inject, Injectable } from '@nestjs/common';

import type { TransactionRunner } from '@/modules/problems/application/ports/out';
import type { IReplaceQuizQuestionsPortIn } from '@/modules/quizzes/application/ports/in/replace-quiz-questions.port.in';
import { QuestionRepository, QuizRepository } from '@/modules/quizzes/application/ports/out';
import { toManagedQuiz } from '@/modules/quizzes/application/results';
import { QuizAuthorizationService } from '@/modules/quizzes/application/services/quiz-authorization.service';
import type { Principal, QuizItem } from '@/modules/quizzes/domain';
import { QuizError } from '@/modules/quizzes/domain';
import { QUIZ_TRANSACTION_RUNNER } from '@/modules/quizzes/quiz.tokens';
@Injectable()
export class ReplaceQuizQuestionsUseCase implements IReplaceQuizQuestionsPortIn {
  constructor(
    private readonly authorization: QuizAuthorizationService,
    private readonly questions: QuestionRepository,
    private readonly quizzes: QuizRepository,
    @Inject(QUIZ_TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
  ) {}
  async execute(
    p: Principal,
    id: string,
    items: QuizItem[],
  ): Promise<ReturnType<typeof toManagedQuiz>> {
    this.authorization.requirePermission(p, 'quiz:update');
    const q = await this.tx.run(async () => {
      const q = await this.quizzes.find(id, true);
      if (!q) throw new QuizError('NOT_FOUND', 'Quiz not found');
      this.authorization.requireOwner(p, q.state);
      const revisions = await this.questions.revisions(items.map((i) => i.questionRevisionId));
      for (const item of [...items].sort((a, b) => a.questionId.localeCompare(b.questionId))) {
        const question = await this.questions.find(item.questionId, true);
        if (
          !question ||
          !revisions.some(
            (r) => r.id === item.questionRevisionId && r.questionId === item.questionId,
          )
        )
          throw new QuizError('INVALID', 'Invalid question revision');
        this.authorization.requireQuestionUse(p, question.state, question.sharedWith);
      }
      q.replace(items);
      await this.quizzes.save(q);
      return q;
    });
    return toManagedQuiz(q, p);
  }
}
