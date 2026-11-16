import type { toLearnerAttempt } from '@/modules/quizzes/application/results';
import type { Principal } from '@/modules/quizzes/domain';
export const GET_MY_QUIZ_RESULT_PORT_IN = Symbol('GetMyQuizResultPortIn');
export interface IGetMyQuizResultPortIn {
  execute(p: Principal, id: string): Promise<ReturnType<typeof toLearnerAttempt>>;
}
