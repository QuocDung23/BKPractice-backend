import type { toLearnerAttempt } from '@/modules/quizzes/application/results';
import type { Principal } from '@/modules/quizzes/domain';
export const GET_MY_QUIZ_ATTEMPT_PORT_IN = Symbol('GetMyQuizAttemptPortIn');
export interface IGetMyQuizAttemptPortIn {
  execute(p: Principal, id: string): Promise<ReturnType<typeof toLearnerAttempt>>;
}
