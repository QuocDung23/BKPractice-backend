import { Inject, Injectable } from '@nestjs/common';

import type { TransactionRunner } from '@/modules/problems/application/ports/out';
import type { CreateQuizCommand } from '@/modules/quizzes/application/commands';
import type { ICreateQuizPortIn } from '@/modules/quizzes/application/ports/in/create-quiz.port.in';
import { QuizRepository } from '@/modules/quizzes/application/ports/out';
import { toManagedQuiz } from '@/modules/quizzes/application/results';
import { hashCommand } from '@/modules/quizzes/application/services/command.utils';
import { QuizAuthorizationService } from '@/modules/quizzes/application/services/quiz-authorization.service';
import type { Principal } from '@/modules/quizzes/domain';
import { Quiz, QuizError } from '@/modules/quizzes/domain';
import { QUIZ_TRANSACTION_RUNNER } from '@/modules/quizzes/quiz.tokens';
@Injectable()
export class CreateQuizUseCase implements ICreateQuizPortIn {
  constructor(
    private readonly authorization: QuizAuthorizationService,
    private readonly quizzes: QuizRepository,
    @Inject(QUIZ_TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
  ) {}
  async execute(
    p: Principal,
    command: CreateQuizCommand,
  ): Promise<ReturnType<typeof toManagedQuiz>> {
    this.authorization.requirePermission(p, 'quiz:create');
    const hash = hashCommand(command);
    const q = await this.tx.run(async () => {
      await this.quizzes.lockRequest(p.userId, command.clientRequestId);
      const old = await this.quizzes.findRequest(p.userId, command.clientRequestId);
      if (old) {
        if (old.state.requestHash !== hash) throw new QuizError('CONFLICT', 'Request id reused');
        return old;
      }
      const q = Quiz.create(
        p.userId,
        command.clientRequestId,
        hash,
        command.title,
        command.description,
      );
      await this.quizzes.save(q);
      return q;
    });
    return toManagedQuiz(q, p);
  }
}
