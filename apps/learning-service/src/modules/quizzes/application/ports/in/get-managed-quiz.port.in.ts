import type { toManagedQuiz } from '@/modules/quizzes/application/results';
import type { Principal } from '@/modules/quizzes/domain';
export const GET_MANAGED_QUIZ_PORT_IN = Symbol('GetManagedQuizPortIn');
export interface IGetManagedQuizPortIn {
  execute(p: Principal, id: string): Promise<ReturnType<typeof toManagedQuiz>>;
}
