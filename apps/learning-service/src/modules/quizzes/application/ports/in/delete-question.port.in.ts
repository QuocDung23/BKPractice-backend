import type { toManagedQuestion } from '@/modules/quizzes/application/results';
import type { Principal } from '@/modules/quizzes/domain';
export const DELETE_QUESTION_PORT_IN = Symbol('DeleteQuestionPortIn');
export interface IDeleteQuestionPortIn {
  execute(p: Principal, id: string): Promise<ReturnType<typeof toManagedQuestion>>;
}
