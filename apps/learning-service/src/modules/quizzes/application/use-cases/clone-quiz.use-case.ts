import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import type { TransactionRunner } from '@/modules/problems/application/ports/out';
import type { ICloneQuizPortIn } from '@/modules/quizzes/application/ports/in/clone-quiz.port.in';
import { QuestionRepository, QuizRepository } from '@/modules/quizzes/application/ports/out';
import { toManagedQuiz } from '@/modules/quizzes/application/results';
import { hashCommand } from '@/modules/quizzes/application/services/command.utils';
import { QuizAuthorizationService } from '@/modules/quizzes/application/services/quiz-authorization.service';
import type { Principal, QuizItem } from '@/modules/quizzes/domain';
import { Question, Quiz, QuizError } from '@/modules/quizzes/domain';
import { QUIZ_TRANSACTION_RUNNER } from '@/modules/quizzes/quiz.tokens';

@Injectable()
export class CloneQuizUseCase implements ICloneQuizPortIn {
  constructor(
    private readonly authorization: QuizAuthorizationService,
    private readonly questions: QuestionRepository,
    private readonly quizzes: QuizRepository,
    @Inject(QUIZ_TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
  ) {}
  async execute(
    p: Principal,
    id: string,
    clientRequestId: string,
  ): Promise<ReturnType<typeof toManagedQuiz>> {
    this.authorization.requirePermission(p, 'quiz:clone');
    const hash = hashCommand({ sourceId: id });
    const copy = await this.tx.run(async () => {
      await this.quizzes.lockRequest(p.userId, clientRequestId);
      const old = await this.quizzes.findRequest(p.userId, clientRequestId);
      if (old) {
        if (old.state.requestHash !== hash) throw new QuizError('CONFLICT', 'Request id reused');
        return old;
      }
      const source = await this.quizzes.find(id, true);
      if (!source) throw new QuizError('NOT_FOUND', 'Quiz not found');
      this.authorization.requireUse(p, source.state, source.sharedWith);
      const own = source.state.createdBy === p.userId || p.roles.includes('ADMIN');
      const rev = own
        ? (source.draft ?? source.published)
        : source.state.status === 'PUBLISHED'
          ? source.published
          : null;
      if (!rev) throw new QuizError('NOT_FOUND', 'No usable revision');
      const q = Quiz.create(p.userId, clientRequestId, hash, rev.title, rev.description);
      const revisions = await this.questions.revisions(rev.items.map((i) => i.questionRevisionId));
      const items: QuizItem[] = [];
      for (const item of rev.items) {
        const r = revisions.find((r) => r.id === item.questionRevisionId)!;
        if (!rev.publishedAt) {
          const original = await this.questions.find(r.questionId, true);
          if (!original) throw new QuizError('NOT_FOUND', 'Question unavailable');
          this.authorization.requireQuestionUse(p, original.state, original.sharedWith);
        }
        const question = Question.create(
          p.userId,
          randomUUID(),
          hashCommand({ clone: q.state.id, questionId: r.questionId }),
          { ...r, options: r.options.map((o) => ({ ...o, id: randomUUID() })) },
          true,
        );
        await this.questions.save(question);
        items.push({ questionId: question.state.id, questionRevisionId: question.revision.id });
      }
      q.replace(items);
      await this.quizzes.save(q);
      return q;
    });
    return toManagedQuiz(copy, p);
  }
}
