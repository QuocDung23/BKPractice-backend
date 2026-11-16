import type { toManagedQuestion } from '@/modules/quizzes/application/results';
import type { Principal } from '@/modules/quizzes/domain';
export const RESTORE_QUESTION_PORT_IN = Symbol('RestoreQuestionPortIn');
export interface IRestoreQuestionPortIn {
  execute(p: Principal, id: string): Promise<ReturnType<typeof toManagedQuestion>>;
}
