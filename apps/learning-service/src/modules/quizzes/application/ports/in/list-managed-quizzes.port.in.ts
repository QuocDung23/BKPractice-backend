import type { toManagedQuiz } from '@/modules/quizzes/application/results';
import type { Page, PageQuery, Principal } from '@/modules/quizzes/domain';
export const LIST_MANAGED_QUIZZES_PORT_IN = Symbol('ListManagedQuizzesPortIn');
export interface IListManagedQuizzesPortIn {
  execute(p: Principal, query: PageQuery): Promise<Page<ReturnType<typeof toManagedQuiz>>>;
}
