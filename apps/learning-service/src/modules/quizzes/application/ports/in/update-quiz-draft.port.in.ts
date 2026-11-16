import type { toManagedQuiz } from '@/modules/quizzes/application/results';
import type { Principal } from '@/modules/quizzes/domain';
export const UPDATE_QUIZ_DRAFT_PORT_IN = Symbol('UpdateQuizDraftPortIn');
export interface IUpdateQuizDraftPortIn {
  execute(
    p: Principal,
    id: string,
    command: { title?: string; description?: string | null },
  ): Promise<ReturnType<typeof toManagedQuiz>>;
}
