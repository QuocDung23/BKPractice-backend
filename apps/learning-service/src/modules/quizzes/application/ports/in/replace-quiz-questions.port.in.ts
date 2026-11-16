import type { toManagedQuiz } from '@/modules/quizzes/application/results';
import type { Principal, QuizItem } from '@/modules/quizzes/domain';
export const REPLACE_QUIZ_QUESTIONS_PORT_IN = Symbol('ReplaceQuizQuestionsPortIn');
export interface IReplaceQuizQuestionsPortIn {
  execute(p: Principal, id: string, items: QuizItem[]): Promise<ReturnType<typeof toManagedQuiz>>;
}
