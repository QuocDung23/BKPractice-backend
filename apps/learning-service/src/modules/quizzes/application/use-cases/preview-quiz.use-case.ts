import { Injectable } from '@nestjs/common';

import type { IPreviewQuizPortIn } from '@/modules/quizzes/application/ports/in/preview-quiz.port.in';
import { QuestionRepository, QuizRepository } from '@/modules/quizzes/application/ports/out';
import { toManagedQuiz } from '@/modules/quizzes/application/results';
import { QuizAuthorizationService } from '@/modules/quizzes/application/services/quiz-authorization.service';
import type { Principal, QuestionRevision } from '@/modules/quizzes/domain';
import { QuizError } from '@/modules/quizzes/domain';
@Injectable()
export class PreviewQuizUseCase implements IPreviewQuizPortIn {
  constructor(
    private readonly authorization: QuizAuthorizationService,
    private readonly questions: QuestionRepository,
    private readonly quizzes: QuizRepository,
  ) {}
  async execute(
    p: Principal,
    id: string,
  ): Promise<{
    quiz: ReturnType<typeof toManagedQuiz>;
    questions: QuestionRevision[];
    questionUpdates: {
      questionId: string;
      selectedRevisionId: string;
      currentRevisionId: string | null;
      usable: boolean;
    }[];
    readiness: { ready: boolean; issues: string[] };
  }> {
    this.authorization.requirePermission(p, 'quiz:read-managed');
    const q = await this.quizzes.find(id);
    if (!q) throw new QuizError('NOT_FOUND', 'Quiz not found');
    this.authorization.requireUse(p, q.state, q.sharedWith);
    const own = q.state.createdBy === p.userId || p.roles.includes('ADMIN');
    const revision = own
      ? (q.draft ?? q.published)
      : q.state.status === 'PUBLISHED'
        ? q.published
        : null;
    if (!revision) throw new QuizError('NOT_FOUND', 'Quiz revision not available');
    const found = await this.questions.revisions(revision.items.map((i) => i.questionRevisionId));
    const sources = await this.questions.findMany(revision.items.map((i) => i.questionId));
    const questionUpdates = revision.items.map((i) => {
      const source = sources.find((s) => s.state.id === i.questionId);
      let usable = false;
      if (source) {
        try {
          this.authorization.requireQuestionUse(p, source.state, source.sharedWith);
          usable = true;
        } catch (error) {
          if (!(error instanceof QuizError)) throw error;
        }
      }
      return {
        questionId: i.questionId,
        selectedRevisionId: i.questionRevisionId,
        currentRevisionId: usable ? source!.revision.id : null,
        usable,
      };
    });
    const questions = revision.items
      .filter(
        (i) =>
          revision.publishedAt ||
          questionUpdates.find((u) => u.questionId === i.questionId)?.usable,
      )
      .map((i) => found.find((r) => r.id === i.questionRevisionId)!);
    const issues = revision.items.length ? [] : ['QUESTION_REQUIRED'];
    if (!revision.publishedAt)
      for (const u of questionUpdates)
        if (!u.usable) issues.push('QUESTION_UNAVAILABLE:' + u.questionId);
    return {
      quiz: toManagedQuiz(q, p),
      questions,
      questionUpdates,
      readiness: { ready: issues.length === 0, issues },
    };
  }
}
