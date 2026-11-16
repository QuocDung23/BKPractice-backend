import type { Principal } from '@/modules/quizzes/domain';
export const GET_MY_QUIZ_COMPLETION_PORT_IN = Symbol('GetMyQuizCompletionPortIn');
export interface IGetMyQuizCompletionPortIn {
  execute(
    p: Principal,
    id: string,
  ): Promise<{ completed: boolean; bestPercentage: number; passedRevisionId: string | null }>;
}
