import type { toManagedQuiz } from '@/modules/quizzes/application/results';
import type { Principal, QuestionRevision } from '@/modules/quizzes/domain';
export const PREVIEW_QUIZ_PORT_IN = Symbol('PreviewQuizPortIn');
export interface IPreviewQuizPortIn {
  execute(
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
  }>;
}
