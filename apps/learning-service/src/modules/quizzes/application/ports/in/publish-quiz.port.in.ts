import type { toManagedQuiz } from '@/modules/quizzes/application/results';
import type { Principal } from '@/modules/quizzes/domain';
export const PUBLISH_QUIZ_PORT_IN = Symbol('PublishQuizPortIn');
export interface IPublishQuizPortIn {
  execute(p: Principal, id: string): Promise<ReturnType<typeof toManagedQuiz>>;
}
