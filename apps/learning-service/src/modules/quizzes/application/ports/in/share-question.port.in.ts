import type { ShareCommand } from '@/modules/quizzes/application/commands';
import type { Principal } from '@/modules/quizzes/domain';
export const SHARE_QUESTION_PORT_IN = Symbol('ShareQuestionPortIn');
export interface IShareQuestionPortIn {
  execute(p: Principal, id: string, command: ShareCommand): Promise<void>;
}
