import type { Principal } from '@/modules/quizzes/domain';
export const LIST_QUESTION_USAGE_PORT_IN = Symbol('ListQuestionUsagePortIn');
export interface IListQuestionUsagePortIn {
  execute(p: Principal, id: string): Promise<{ id: string; title: string }[]>;
}
