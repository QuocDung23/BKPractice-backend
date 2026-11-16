import type {
  Answer,
  Principal,
  Question,
  QuestionRevision,
  Quiz,
  QuizAttempt,
} from '@/modules/quizzes/domain';
export function toManagedQuestion(q: Question, p: Principal) {
  return {
    id: q.state.id,
    createdBy: q.state.createdBy,
    deletedAt: q.state.deletedAt,
    isPrivate: q.state.isPrivate,
    sharedWith: p.roles.includes('ADMIN') || q.state.createdBy === p.userId ? q.sharedWith : null,
    revision: q.revision,
  };
}
export function toManagedQuiz(q: Quiz, p: Principal) {
  const own = p.roles.includes('ADMIN') || q.state.createdBy === p.userId;
  return {
    id: q.state.id,
    createdBy: q.state.createdBy,
    status: q.state.status,
    deletedAt: q.state.deletedAt,
    draft: own ? q.draft : null,
    sharedWith: own ? q.sharedWith : null,
    published: q.published,
  };
}
export function toFeedback(answer: Answer, questions: QuestionRevision[]) {
  const q = questions.find((q) => q.id === answer.questionRevisionId)!;
  return {
    questionId: answer.questionId,
    selectedOptionId: answer.selectedOptionId,
    isCorrect: answer.isCorrect,
    correctOptionId: q.options.find((o) => o.isCorrect)!.id,
    explanation: q.explanation,
    answeredAt: answer.answeredAt,
  };
}
export function toSummary(a: QuizAttempt) {
  return {
    correctCount: a.state.correctCount,
    wrongCount: a.state.totalQuestions - (a.state.correctCount ?? 0),
    totalQuestions: a.state.totalQuestions,
    percentage: ((a.state.correctCount ?? 0) * 100) / a.state.totalQuestions,
    thresholdPercentage: 90,
    passed: a.state.passed,
    startedAt: a.state.startedAt,
    finishedAt: a.state.finishedAt,
  };
}
export function toLearnerAttempt(a: QuizAttempt) {
  return {
    id: a.state.id,
    quizId: a.state.quizId,
    quizRevisionId: a.state.quizRevisionId,
    status: a.state.status,
    totalQuestions: a.state.totalQuestions,
    answeredCount: a.answers.length,
    startedAt: a.state.startedAt,
    finishedAt: a.state.finishedAt,
    questions: a.questions.map((q) => {
      const answer = a.answers.find((x) => x.questionId === q.questionId);
      return {
        id: q.questionId,
        content: q.content,
        options: q.options.map((o) => ({ id: o.id, content: o.content })),
        feedback: answer ? toFeedback(answer, a.questions) : null,
      };
    }),
    summary: a.state.status === 'FINISHED' ? toSummary(a) : null,
  };
}
