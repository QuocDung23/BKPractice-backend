import { Inject, Injectable } from '@nestjs/common';

import type { TransactionRunner } from '@/modules/problems/application/ports/out';
import type { IAnswerQuizQuestionPortIn } from '@/modules/quizzes/application/ports/in/answer-quiz-question.port.in';
import { QuizAttemptRepository } from '@/modules/quizzes/application/ports/out';
import { toFeedback } from '@/modules/quizzes/application/results';
import type { Principal } from '@/modules/quizzes/domain';
import { QuizError } from '@/modules/quizzes/domain';
import { QUIZ_TRANSACTION_RUNNER } from '@/modules/quizzes/quiz.tokens';
@Injectable()
export class AnswerQuizQuestionUseCase implements IAnswerQuizQuestionPortIn {
  constructor(
    private readonly attempts: QuizAttemptRepository,
    @Inject(QUIZ_TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
  ) {}
  async execute(
    p: Principal,
    id: string,
    questionId: string,
    optionId: string,
  ): Promise<ReturnType<typeof toFeedback>> {
    const result = await this.tx.run(async () => {
      const a = await this.attempts.find(id, p.userId, true);
      if (!a) throw new QuizError('NOT_FOUND', 'Attempt not found');
      const answer = a.answer(questionId, optionId);
      await this.attempts.save(a);
      return { answer, questions: a.questions };
    });
    return toFeedback(result.answer, result.questions);
  }
}
