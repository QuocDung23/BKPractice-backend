import type { toLearnerAttempt } from '@/modules/quizzes/application/results';
import type { Page, PageQuery, Principal } from '@/modules/quizzes/domain';
export const LIST_MY_QUIZ_ATTEMPTS_PORT_IN = Symbol('ListMyQuizAttemptsPortIn');
export interface IListMyQuizAttemptsPortIn {
  execute(p: Principal, query: PageQuery): Promise<Page<ReturnType<typeof toLearnerAttempt>>>;
}
