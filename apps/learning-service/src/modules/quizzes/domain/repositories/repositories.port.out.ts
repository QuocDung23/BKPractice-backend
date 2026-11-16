import type {
  Page,
  PageQuery,
  Principal,
  Question,
  QuestionRevision,
  Quiz,
  QuizAttempt,
  QuizRevision,
} from '@/modules/quizzes/domain';
export abstract class QuestionRepository {
  abstract lockRequest(owner: string, requestId: string): Promise<void>;
  abstract find(id: string, lock?: boolean): Promise<Question | null>;
  abstract findMany(ids: string[]): Promise<Question[]>;
  abstract findRequest(owner: string, requestId: string): Promise<Question | null>;
  abstract save(question: Question): Promise<void>;
  abstract list(principal: Principal, query: PageQuery): Promise<Page<Question>>;
  abstract revisions(ids: string[]): Promise<QuestionRevision[]>;
  abstract share(id: string, userId: string, enabled: boolean): Promise<void>;
  abstract usage(id: string, principal: Principal): Promise<{ id: string; title: string }[]>;
}
export abstract class QuizRepository {
  abstract lockRequest(owner: string, requestId: string): Promise<void>;
  abstract find(id: string, lock?: boolean): Promise<Quiz | null>;
  abstract findRequest(owner: string, requestId: string): Promise<Quiz | null>;
  abstract save(quiz: Quiz): Promise<void>;
  abstract list(principal: Principal, query: PageQuery): Promise<Page<Quiz>>;
  abstract revision(id: string): Promise<QuizRevision | null>;
  abstract share(id: string, userId: string, enabled: boolean): Promise<void>;
}
export abstract class QuizAttemptRepository {
  abstract lockStart(userId: string, quizId: string): Promise<void>;
  abstract find(id: string, userId: string, lock?: boolean): Promise<QuizAttempt | null>;
  abstract active(userId: string, quizId: string): Promise<QuizAttempt | null>;
  abstract save(attempt: QuizAttempt): Promise<void>;
  abstract list(userId: string, query: PageQuery): Promise<Page<QuizAttempt>>;
  abstract completed(
    userId: string,
    quizId: string,
  ): Promise<{ completed: boolean; bestPercentage: number; passedRevisionId: string | null }>;
}
