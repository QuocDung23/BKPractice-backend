import { DomainValidationError } from '@/modules/courses/domain/errors';
import {
  CourseReadiness,
  type LearningItemState,
  ProblemAttachPolicy,
} from '@/modules/courses/domain/services/course-readiness';
import type { ProblemStateForReadiness } from '@/modules/courses/domain/services/course-readiness';
import {
  courseWithProblem,
  courseWithQuiz,
  draftCourse,
  PROBLEM_ID,
  QUIZ_ID,
} from '@/modules/courses/testing';

const state = (overrides: Partial<ProblemStateForReadiness> = {}): ProblemStateForReadiness => ({
  problemId: PROBLEM_ID,
  publishStatus: 'PUBLISHED',
  isDeleted: false,
  ...overrides,
});

const item = (overrides: Partial<LearningItemState> = {}): LearningItemState => ({
  id: PROBLEM_ID,
  type: 'PROBLEM',
  status: 'PUBLISHED',
  isDeleted: false,
  ...overrides,
});

describe('CourseReadiness', () => {
  const readiness = new CourseReadiness();

  it('is ready with a title, a chapter and a published, non-deleted problem', () => {
    expect(readiness.check(courseWithProblem(), [item()])).toEqual([]);
    expect(readiness.isReady(courseWithProblem(), [item()])).toBe(true);
  });

  it('is ready with only a published Quiz', () => {
    const quiz = item({ id: QUIZ_ID, type: 'QUIZ' });
    expect(readiness.check(courseWithQuiz(), [quiz])).toEqual([]);
  });

  it('reports a missing chapter', () => {
    expect(readiness.check(draftCourse(), [])).toEqual(
      expect.arrayContaining(['CHAPTER_REQUIRED', 'PUBLISHED_CONTENT_REQUIRED']),
    );
  });

  it.each([
    ['DRAFT problem', item({ status: 'DRAFT' })],
    ['ON_HOLD problem', item({ status: 'ON_HOLD' })],
    ['deleted problem', item({ isDeleted: true })],
  ])('is not ready when the only content is a %s', (_name, itemState) => {
    expect(readiness.check(courseWithProblem(), [itemState])).toEqual([
      'PUBLISHED_CONTENT_REQUIRED',
    ]);
  });

  it('is not ready when the content state is unknown', () => {
    expect(readiness.check(courseWithProblem(), [])).toEqual(['PUBLISHED_CONTENT_REQUIRED']);
  });
});

describe('ProblemAttachPolicy', () => {
  const policy = new ProblemAttachPolicy();

  it('allows any published, non-deleted problem', () => {
    expect(policy.isAttachable(state())).toBe(true);
  });

  it.each(['DRAFT', 'ON_HOLD'] as const)('allows a non-deleted %s problem', (publishStatus) => {
    expect(policy.isAttachable(state({ publishStatus }))).toBe(true);
  });

  it('rejects deleted or unknown problems the same way', () => {
    expect(policy.isAttachable(state({ isDeleted: true }))).toBe(false);
    expect(policy.isAttachable(undefined)).toBe(false);
    expect(() => policy.assertAttachable(undefined)).toThrow(DomainValidationError);
  });
});
