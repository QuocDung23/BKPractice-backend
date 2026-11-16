import type { toManagedQuestion } from '@/modules/quizzes/application/results';
import type { Principal } from '@/modules/quizzes/domain';

export const SET_QUESTION_VISIBILITY_PORT_IN = Symbol('SetQuestionVisibilityPortIn');

export interface ISetQuestionVisibilityPortIn {
  execute(
    principal: Principal,
    questionId: string,
    isPrivate: boolean,
  ): Promise<ReturnType<typeof toManagedQuestion>>;
}
