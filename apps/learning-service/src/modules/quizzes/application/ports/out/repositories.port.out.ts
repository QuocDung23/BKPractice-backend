export {
  QuestionRepository,
  QuizAttemptRepository,
  QuizRepository,
} from '@/modules/quizzes/domain/repositories';
import type { Answer } from '@/modules/quizzes/domain';
export abstract class QuizCourseAccessReader {
  abstract isVisible(quizId: string): Promise<boolean>;
}
export abstract class BankTaxonomyReader {
  abstract validate(topicIds: string[], tagIds: string[]): Promise<void>;
}
export abstract class QuizReferenceReader {
  abstract read(ids: string[]): Promise<
    Map<
      string,
      {
        id: string;
        title: string;
        status: string;
        deletedAt: Date | null;
        createdBy: string;
        sharedWith: string[];
      }
    >
  >;
}
export interface AnswerFeedback {
  answer: Answer;
  correctOptionId: string;
  explanation: string;
}

export abstract class ShareRecipientReader {
  abstract requireLecturer(userId: string): Promise<void>;
}
