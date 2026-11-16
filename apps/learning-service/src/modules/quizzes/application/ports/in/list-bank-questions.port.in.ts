import type { toManagedQuestion } from '@/modules/quizzes/application/results';
import type { Page, PageQuery, Principal } from '@/modules/quizzes/domain';
export const LIST_BANK_QUESTIONS_PORT_IN = Symbol('ListBankQuestionsPortIn');
export interface IListBankQuestionsPortIn {
  execute(p: Principal, query: PageQuery): Promise<Page<ReturnType<typeof toManagedQuestion>>>;
}
