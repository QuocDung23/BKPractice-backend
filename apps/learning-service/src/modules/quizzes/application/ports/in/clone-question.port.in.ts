import type { toManagedQuestion } from '@/modules/quizzes/application/results';
import type { Principal } from '@/modules/quizzes/domain';
export const CLONE_QUESTION_PORT_IN = Symbol('CloneQuestionPortIn');
export interface ICloneQuestionPortIn {
  execute(
    p: Principal,
    id: string,
    clientRequestId: string,
  ): Promise<ReturnType<typeof toManagedQuestion>>;
}
