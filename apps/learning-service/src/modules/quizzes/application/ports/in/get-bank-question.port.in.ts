import type { toManagedQuestion } from '@/modules/quizzes/application/results';
import type { Principal } from '@/modules/quizzes/domain';
export const GET_BANK_QUESTION_PORT_IN = Symbol('GetBankQuestionPortIn');
export interface IGetBankQuestionPortIn {
  execute(p: Principal, id: string): Promise<ReturnType<typeof toManagedQuestion>>;
}
