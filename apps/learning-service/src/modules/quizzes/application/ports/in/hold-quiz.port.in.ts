import type { toManagedQuiz } from '@/modules/quizzes/application/results';
import type { Principal } from '@/modules/quizzes/domain';
export const HOLD_QUIZ_PORT_IN = Symbol('HoldQuizPortIn');
export interface IHoldQuizPortIn {
  execute(p: Principal, id: string): Promise<ReturnType<typeof toManagedQuiz>>;
}
