import type { Difficulty } from '@/modules/quizzes/domain';
export interface QuestionInput {
  content: string;
  explanation: string;
  options: { id?: string; content: string; isCorrect: boolean }[];
  difficulty: Difficulty;
  topicIds: string[];
  tagIds: string[];
}
export interface CreateQuestionCommand extends QuestionInput {
  clientRequestId: string;
  isPrivate?: boolean;
}
export interface CreateQuizCommand {
  title: string;
  description: string | null;
  clientRequestId: string;
}
export interface ShareCommand {
  userId: string;
  enabled: boolean;
}
