import type { toSummary } from '@/modules/quizzes/application/results';
import type { Principal } from '@/modules/quizzes/domain';
export const FINISH_QUIZ_ATTEMPT_PORT_IN = Symbol('FinishQuizAttemptPortIn');
export interface IFinishQuizAttemptPortIn {
  execute(p: Principal, id: string): Promise<ReturnType<typeof toSummary>>;
}
