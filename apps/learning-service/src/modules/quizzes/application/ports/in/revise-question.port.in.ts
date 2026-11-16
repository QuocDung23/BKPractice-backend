import type { QuestionInput } from '@/modules/quizzes/application/commands';
import type { toManagedQuestion } from '@/modules/quizzes/application/results';
import type { Principal } from '@/modules/quizzes/domain';
export const REVISE_QUESTION_PORT_IN = Symbol('ReviseQuestionPortIn');
export interface IReviseQuestionPortIn {
  execute(
    p: Principal,
    id: string,
    command: QuestionInput,
  ): Promise<ReturnType<typeof toManagedQuestion>>;
}
