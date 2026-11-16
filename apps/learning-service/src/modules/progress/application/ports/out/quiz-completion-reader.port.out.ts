export interface QuizCompletionReader {
  findCompleted(userId: string, quizIds: readonly string[]): Promise<ReadonlyMap<string, Date>>;
}
