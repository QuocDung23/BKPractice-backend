import { CourseCompletionCalculator } from './course-completion.calculator';

import { CompletionCount } from '@/modules/progress/domain/value-objects';

describe('Course completion', () => {
  const calculator = new CourseCompletionCalculator();
  const solvedAt = new Date('2026-11-07T00:00:00Z');

  it('counts visible Problems and Quizzes as equally weighted Learning Items', () => {
    const result = calculator.calculate(
      {
        courseId: 'course',
        chapters: [
          {
            chapterId: 'second',
            items: [
              { type: 'PROBLEM', itemId: 'b' },
              { type: 'QUIZ', itemId: 'q' },
              { type: 'PROBLEM', itemId: 'a' },
            ],
          },
          { chapterId: 'empty', items: [] },
          { chapterId: 'first', items: [{ type: 'QUIZ', itemId: 'unfinished' }] },
        ],
      },
      new Map([
        ['PROBLEM:a', solvedAt],
        ['PROBLEM:b', solvedAt],
        ['QUIZ:q', solvedAt],
        ['PROBLEM:outside-course', solvedAt],
      ]),
    );
    expect(result).toEqual({
      courseId: 'course',
      completed: 3,
      total: 4,
      chapters: [
        { chapterId: 'second', completed: 3, total: 3 },
        { chapterId: 'empty', completed: 0, total: 0 },
        { chapterId: 'first', completed: 0, total: 1 },
      ],
      completedItems: [
        { type: 'PROBLEM', itemId: 'b', completedAt: solvedAt },
        { type: 'QUIZ', itemId: 'q', completedAt: solvedAt },
        { type: 'PROBLEM', itemId: 'a', completedAt: solvedAt },
      ],
    });
  });

  it('accepts a visible Course without any visible Learning Items', () => {
    expect(calculator.calculate({ courseId: 'course', chapters: [] }, new Map())).toEqual({
      courseId: 'course',
      completed: 0,
      total: 0,
      chapters: [],
      completedItems: [],
    });
    expect(new CompletionCount(0, 0)).toEqual({ solved: 0, total: 0 });
  });

  it.each([
    [-1, 0],
    [2, 1],
    [0, -1],
    [0.5, 1],
    [0, Infinity],
  ])('rejects invalid solved/total %s/%s', (solved, total) => {
    expect(() => new CompletionCount(solved, total)).toThrow(RangeError);
  });
});
