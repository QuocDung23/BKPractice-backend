import type { Principal } from '@/modules/quizzes/domain';
export const GET_PUBLISHED_QUIZ_PORT_IN = Symbol('GetPublishedQuizPortIn');
export interface IGetPublishedQuizPortIn {
  execute(
    p: Principal,
    id: string,
  ): Promise<{ id: string; title: string; description: string | null; questionCount: number }>;
}
