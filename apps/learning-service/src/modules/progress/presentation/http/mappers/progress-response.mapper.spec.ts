import { toCourseProgressResponse } from './progress-response.mapper';

describe('Progress response mapper', () => {
  it('exposes Learning Item completion and backward-compatible Problem aliases', () => {
    const problemAt = new Date('2026-01-01T00:00:00.000Z');
    const quizAt = new Date('2026-01-02T00:00:00.000Z');

    expect(
      toCourseProgressResponse({
        courseId: 'course',
        completed: 2,
        total: 2,
        chapters: [{ chapterId: 'chapter', completed: 2, total: 2 }],
        completedItems: [
          { type: 'PROBLEM', itemId: 'problem', completedAt: problemAt },
          { type: 'QUIZ', itemId: 'quiz', completedAt: quizAt },
        ],
      }),
    ).toEqual({
      courseId: 'course',
      completed: 2,
      solved: 2,
      total: 2,
      chapters: [{ chapterId: 'chapter', completed: 2, solved: 2, total: 2 }],
      completedItems: [
        { type: 'PROBLEM', itemId: 'problem', completedAt: problemAt.toISOString() },
        { type: 'QUIZ', itemId: 'quiz', completedAt: quizAt.toISOString() },
      ],
      solvedProblems: [{ problemId: 'problem', solvedAt: problemAt.toISOString() }],
    });
  });
});
