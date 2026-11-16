import type { toManagedQuiz } from '@/modules/quizzes/application/results';
import type { Principal } from '@/modules/quizzes/domain';
export const RESTORE_QUIZ_PORT_IN = Symbol('RestoreQuizPortIn');
export interface IRestoreQuizPortIn {
  execute(p: Principal, id: string): Promise<ReturnType<typeof toManagedQuiz>>;
}
