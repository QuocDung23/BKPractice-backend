import type { toManagedQuiz } from '@/modules/quizzes/application/results';
import type { Principal } from '@/modules/quizzes/domain';
export const CLONE_QUIZ_PORT_IN = Symbol('CloneQuizPortIn');
export interface ICloneQuizPortIn {
  execute(
    p: Principal,
    id: string,
    clientRequestId: string,
  ): Promise<ReturnType<typeof toManagedQuiz>>;
}
