import { Inject, Injectable } from '@nestjs/common';

import type { TransactionRunner } from '@/modules/problems/application/ports/out';
import type { ShareCommand } from '@/modules/quizzes/application/commands';
import type { IShareQuizPortIn } from '@/modules/quizzes/application/ports/in/share-quiz.port.in';
import { QuizRepository, ShareRecipientReader } from '@/modules/quizzes/application/ports/out';
import { QuizAuthorizationService } from '@/modules/quizzes/application/services/quiz-authorization.service';
import type { Principal } from '@/modules/quizzes/domain';
import { QuizError } from '@/modules/quizzes/domain';
import { QUIZ_TRANSACTION_RUNNER } from '@/modules/quizzes/quiz.tokens';
@Injectable()
export class ShareQuizUseCase implements IShareQuizPortIn {
  constructor(
    private readonly authorization: QuizAuthorizationService,
    private readonly quizzes: QuizRepository,
    private readonly recipient: ShareRecipientReader,
    @Inject(QUIZ_TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
  ) {}
  async execute(p: Principal, id: string, command: ShareCommand): Promise<void> {
    this.authorization.requirePermission(p, 'quiz:share');
    const resource = await this.quizzes.find(id);
    if (!resource) throw new QuizError('NOT_FOUND', 'Quiz not found');
    this.authorization.requireOwner(p, resource.state);
    if (command.enabled) await this.recipient.requireLecturer(command.userId);
    await this.tx.run(async () => {
      const q = await this.quizzes.find(id, true);
      if (!q) throw new QuizError('NOT_FOUND', 'Quiz not found');
      this.authorization.requireOwner(p, q.state);
      await this.quizzes.share(id, command.userId, command.enabled);
    });
  }
}
