import type { toFeedback } from '@/modules/quizzes/application/results';
import type { Principal } from '@/modules/quizzes/domain';
export const ANSWER_QUIZ_QUESTION_PORT_IN = Symbol('AnswerQuizQuestionPortIn');
export interface IAnswerQuizQuestionPortIn {
  execute(
    p: Principal,
    id: string,
    questionId: string,
    optionId: string,
  ): Promise<ReturnType<typeof toFeedback>>;
}
