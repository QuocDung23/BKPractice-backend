import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { UnauthorizedError as PrincipalUnauthorizedError } from '@learning/modules/problems/application/errors/unauthorized.error';

import {
  ConcurrentModificationError,
  CourseNotFoundError,
  CourseNotReadyError,
  DuplicateCourseSlugError,
  ForbiddenError,
  ProblemNotAttachableError,
  UnauthorizedError,
} from '@/modules/courses/application/errors';
import {
  ChapterNotFound,
  DomainValidationError,
  InvalidCourseState,
  ProblemAlreadyInCourse,
} from '@/modules/courses/domain/errors';
import {
  COURSE_ERROR_CODES,
  describeCourseError,
} from '@/modules/courses/presentation/http/filters/course-errors';

const COURSES_ROOT = join(__dirname, '..', '..', '..');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return name === 'testing' ? [] : sourceFiles(path);
    return name.endsWith('.ts') && !name.endsWith('.spec.ts') ? [path] : [];
  });
}

describe('course error catalog', () => {
  it('uses a unique code for every error', () => {
    const codes = Object.values(COURSE_ERROR_CODES);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it.each([
    [new UnauthorizedError('x'), 401, 'AUTH_PRINCIPAL_INVALID'],
    [new PrincipalUnauthorizedError(), 401, 'AUTH_PRINCIPAL_INVALID'],
    [new ForbiddenError('Not the owner'), 403, 'COURSE_NOT_OWNER'],
    [new ForbiddenError('Content belongs to another lecturer'), 403, 'COURSE_NOT_OWNER'],
    [new ForbiddenError('Missing content manager role'), 403, 'AUTH_ROLE_REQUIRED'],
    [new ForbiddenError('Missing course:create'), 403, 'AUTH_PERMISSION_MISSING'],
    [new ForbiddenError('anything else'), 403, 'COURSE_FORBIDDEN'],
    [new CourseNotFoundError('Course not found'), 404, 'COURSE_NOT_FOUND'],
    [new CourseNotFoundError('Quiz not available'), 404, 'COURSE_QUIZ_NOT_AVAILABLE'],
    [new ChapterNotFound('c1'), 404, 'CHAPTER_NOT_FOUND'],
    [new ProblemNotAttachableError('x'), 400, 'COURSE_PROBLEM_NOT_ATTACHABLE'],
    [new DuplicateCourseSlugError('x'), 409, 'COURSE_SLUG_ALREADY_EXISTS'],
    [new ProblemAlreadyInCourse('p1'), 409, 'COURSE_PROBLEM_ALREADY_ATTACHED'],
    [new ConcurrentModificationError('x'), 409, 'COURSE_CONCURRENT_MODIFICATION'],
    [new DomainValidationError('title', 'title must not be empty'), 400, 'COURSE_FIELD_INVALID'],
    [
      new DomainValidationError('chapterOrder', 'Duplicate chapter in reorder'),
      400,
      'COURSE_ORDER_INVALID',
    ],
    [
      new DomainValidationError('slug', 'This slug is reserved for course management'),
      400,
      'COURSE_SLUG_RESERVED',
    ],
    [
      new DomainValidationError('problems', 'Problem not in chapter'),
      400,
      'COURSE_PROBLEM_NOT_IN_CHAPTER',
    ],
    [new InvalidCourseState('status', 'Course is not editable'), 409, 'COURSE_NOT_EDITABLE'],
    [
      new InvalidCourseState('status', 'Cannot republish a course with status DRAFT'),
      409,
      'COURSE_STATUS_TRANSITION_INVALID',
    ],
    [
      new InvalidCourseState('deleted', 'A deleted course cannot be published'),
      409,
      'COURSE_DELETED_CANNOT_MODIFY',
    ],
    [
      new InvalidCourseState('status', 'A course on hold cannot be updated'),
      409,
      'COURSE_ON_HOLD_CANNOT_MODIFY',
    ],
    [
      new InvalidCourseState('deleted', 'The course is already deleted'),
      409,
      'COURSE_ALREADY_DELETED',
    ],
    [new InvalidCourseState('deleted', 'The course is not deleted'), 409, 'COURSE_NOT_DELETED'],
    [
      new InvalidCourseState('status', 'Only a published or on-hold course can be deleted'),
      409,
      'COURSE_DELETE_STATE_INVALID',
    ],
  ])('maps %s to %i %s with a Vietnamese message', (exception, status, code) => {
    const descriptor = describeCourseError(exception);

    expect(descriptor).toMatchObject({ status, code });
    expect(descriptor?.message).toMatch(/[ăâđêôơưáàảãạéèẻẽẹíìỉĩịóòỏõọúùủũụýỳỷỹỵ]/i);
  });

  it('puts readiness issues into Vietnamese details', () => {
    const descriptor = describeCourseError(
      new CourseNotReadyError(['CHAPTER_REQUIRED', 'PUBLISHED_CONTENT_REQUIRED']),
    );

    expect(descriptor).toMatchObject({
      status: 400,
      code: 'COURSE_NOT_READY',
      message: 'Khóa học chưa đủ điều kiện xuất bản: còn 2 mục cần hoàn thiện.',
      details: [
        { code: 'CHAPTER_REQUIRED', message: 'Khóa học cần có ít nhất một chương.' },
        { code: 'PUBLISHED_CONTENT_REQUIRED' },
      ],
    });
  });

  it('returns null for errors that are not course errors', () => {
    expect(describeCourseError(new Error('boom'))).toBeNull();
  });

  it('knows every literal message that the courses module throws today', () => {
    const found: Array<{ kind: string; field: string; message: string }> = [];
    const pattern =
      /new (DomainValidationError|InvalidCourseState)\(\s*'([^']*)',\s*'([^']+)'\s*,?\s*\)/g;
    for (const file of sourceFiles(COURSES_ROOT)) {
      for (const match of readFileSync(file, 'utf8').matchAll(pattern)) {
        found.push({ kind: match[1] ?? '', field: match[2] ?? '', message: match[3] ?? '' });
      }
    }

    expect(found.length).toBeGreaterThan(15);
    for (const { kind, field, message } of found) {
      const descriptor = describeCourseError(
        kind === 'InvalidCourseState'
          ? new InvalidCourseState(field, message)
          : new DomainValidationError(field, message),
      );
      const generic =
        kind === 'InvalidCourseState'
          ? descriptor?.code === COURSE_ERROR_CODES.stateInvalid
          : descriptor?.details?.[0]?.code === 'INVALID';
      expect({ message, generic }).toEqual({ message, generic: false });
    }
  });
});
