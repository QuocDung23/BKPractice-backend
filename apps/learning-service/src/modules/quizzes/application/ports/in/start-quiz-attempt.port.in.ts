import type { toLearnerAttempt } from '@/modules/quizzes/application/results';
import type { Principal } from '@/modules/quizzes/domain';
export const START_QUIZ_ATTEMPT_PORT_IN = Symbol('StartQuizAttemptPortIn');
export interface IStartQuizAttemptPortIn {
  execute(p: Principal, id: string): Promise<ReturnType<typeof toLearnerAttempt>>;
}
