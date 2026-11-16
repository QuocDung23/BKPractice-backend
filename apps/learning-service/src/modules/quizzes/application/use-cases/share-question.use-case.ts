import { Inject, Injectable } from '@nestjs/common';

import type { TransactionRunner } from '@/modules/problems/application/ports/out';
import type { ShareCommand } from '@/modules/quizzes/application/commands';
import type { IShareQuestionPortIn } from '@/modules/quizzes/application/ports/in/share-question.port.in';
import { QuestionRepository, ShareRecipientReader } from '@/modules/quizzes/application/ports/out';
import { QuizAuthorizationService } from '@/modules/quizzes/application/services/quiz-authorization.service';
import type { Principal } from '@/modules/quizzes/domain';
import { QuizError } from '@/modules/quizzes/domain';
import { QUIZ_TRANSACTION_RUNNER } from '@/modules/quizzes/quiz.tokens';
@Injectable()
export class ShareQuestionUseCase implements IShareQuestionPortIn {
  constructor(
    private readonly authorization: QuizAuthorizationService,
    private readonly questions: QuestionRepository,
    private readonly recipient: ShareRecipientReader,
    @Inject(QUIZ_TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
  ) {}
  async execute(p: Principal, id: string, command: ShareCommand): Promise<void> {
    this.authorization.requirePermission(p, 'question:share');
    const resource = await this.questions.find(id);
    if (!resource) throw new QuizError('NOT_FOUND', 'Question not found');
    this.authorization.requireOwner(p, resource.state);
    if (command.enabled) await this.recipient.requireLecturer(command.userId);
    await this.tx.run(async () => {
      const q = await this.questions.find(id, true);
      if (!q) throw new QuizError('NOT_FOUND', 'Question not found');
      this.authorization.requireOwner(p, q.state);
      await this.questions.share(id, command.userId, command.enabled);
    });
  }
}
