import type { toManagedQuiz } from '@/modules/quizzes/application/results';
import type { Principal } from '@/modules/quizzes/domain';
export const REPUBLISH_QUIZ_PORT_IN = Symbol('RepublishQuizPortIn');
export interface IRepublishQuizPortIn {
  execute(p: Principal, id: string): Promise<ReturnType<typeof toManagedQuiz>>;
}
