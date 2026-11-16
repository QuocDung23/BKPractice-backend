import type { CreateQuizCommand } from '@/modules/quizzes/application/commands';
import type { toManagedQuiz } from '@/modules/quizzes/application/results';
import type { Principal } from '@/modules/quizzes/domain';
export const CREATE_QUIZ_PORT_IN = Symbol('CreateQuizPortIn');
export interface ICreateQuizPortIn {
  execute(p: Principal, command: CreateQuizCommand): Promise<ReturnType<typeof toManagedQuiz>>;
}
