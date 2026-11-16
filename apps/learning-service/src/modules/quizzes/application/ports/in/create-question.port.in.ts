import type { CreateQuestionCommand } from '@/modules/quizzes/application/commands';
import type { toManagedQuestion } from '@/modules/quizzes/application/results';
import type { Principal } from '@/modules/quizzes/domain';
export const CREATE_QUESTION_PORT_IN = Symbol('CreateQuestionPortIn');
export interface ICreateQuestionPortIn {
  execute(
    p: Principal,
    command: CreateQuestionCommand,
  ): Promise<ReturnType<typeof toManagedQuestion>>;
}
