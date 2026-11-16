import type { ShareCommand } from '@/modules/quizzes/application/commands';
import type { Principal } from '@/modules/quizzes/domain';
export const SHARE_QUIZ_PORT_IN = Symbol('ShareQuizPortIn');
export interface IShareQuizPortIn {
  execute(p: Principal, id: string, command: ShareCommand): Promise<void>;
}
