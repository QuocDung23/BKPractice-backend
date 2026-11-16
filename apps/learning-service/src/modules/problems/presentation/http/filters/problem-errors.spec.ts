import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { ForbiddenError } from '@learning/modules/problems/application/errors/forbidden.error';
import { DomainValidationError } from '@learning/modules/problems/domain/errors/domain-validation.error';
import { InvalidProblemState } from '@learning/modules/problems/domain/errors/invalid-problem-state.error';
import {
  PROBLEM_ERROR_CODES,
  describeProblemError,
} from '@learning/modules/problems/presentation/http/filters/problem-errors';

const PROBLEMS_ROOT = join(__dirname, '..', '..', '..', '..');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return name === 'testing' ? [] : sourceFiles(path);
    return name.endsWith('.ts') && !name.endsWith('.spec.ts') ? [path] : [];
  });
}

describe('problem error catalog', () => {
  it('uses a unique code for every error', () => {
    const codes = Object.values(PROBLEM_ERROR_CODES);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it.each([
    [
      'A deleted problem cannot be updated',
      'PROBLEM_DELETED_CANNOT_MODIFY',
      'Bài tập đã bị xóa nên không thể cập nhật. Hãy khôi phục bài tập trước.',
    ],
    [
      'A problem on hold cannot manage harnesses',
      'PROBLEM_ON_HOLD_CANNOT_MODIFY',
      'Bài tập đang tạm ngưng nên không thể quản lý harness. Hãy xuất bản lại bài tập trước.',
    ],
    [
      'The problem type can only be changed while the problem is a draft',
      'PROBLEM_TYPE_LOCKED',
      'Chỉ đổi được loại bài tập khi bài tập còn ở trạng thái nháp.',
    ],
    [
      'The problem is already deleted',
      'PROBLEM_ALREADY_DELETED',
      'Bài tập này đã bị xóa từ trước.',
    ],
    [
      'The problem is not deleted',
      'PROBLEM_NOT_DELETED',
      'Bài tập này chưa bị xóa nên không cần khôi phục.',
    ],
    [
      'Cannot publish a problem with status ON_HOLD',
      'PROBLEM_STATUS_TRANSITION_INVALID',
      'Không thể xuất bản bài tập đang ở trạng thái "tạm ngưng".',
    ],
    [
      'A FUNCTION problem requires a harness for python',
      'PROBLEM_HARNESS_REQUIRED',
      'Bài tập loại FUNCTION cần có harness cho ngôn ngữ python trước khi chấm. Hãy thêm harness rồi thử lại.',
    ],
  ])('maps the state "%s" to %s', (message, code, expected) => {
    const descriptor = describeProblemError(new InvalidProblemState('state', message));

    expect(descriptor).toEqual({ status: 409, code, message: expected });
  });

  it('names the missing permission, the role or the owner in a 403', () => {
    expect(
      describeProblemError(new ForbiddenError('Missing permission problem:create')),
    ).toMatchObject({
      status: 403,
      code: 'AUTH_PERMISSION_MISSING',
      message: expect.stringContaining('"problem:create"') as string,
    });
    expect(
      describeProblemError(new ForbiddenError('Lecturer or admin role required')),
    ).toMatchObject({
      code: 'AUTH_ROLE_REQUIRED',
    });
    expect(
      describeProblemError(new ForbiddenError('Only the problem owner or an admin can do this')),
    ).toMatchObject({ code: 'PROBLEM_NOT_OWNER' });
  });

  it('returns null for errors that are not problem errors', () => {
    expect(describeProblemError(new Error('boom'))).toBeNull();
  });

  it('knows every literal message that the problems module throws today', () => {
    const files = sourceFiles(PROBLEMS_ROOT);
    const found: Array<{ kind: string; field: string; message: string }> = [];
    const pattern =
      /new (DomainValidationError|InvalidProblemState)\(\s*'([^']*)',\s*'([^']+)'\s*,?\s*\)/g;
    for (const file of files) {
      for (const match of readFileSync(file, 'utf8').matchAll(pattern)) {
        found.push({ kind: match[1] ?? '', field: match[2] ?? '', message: match[3] ?? '' });
      }
    }

    expect(found.length).toBeGreaterThan(15);
    for (const { kind, field, message } of found) {
      const descriptor = describeProblemError(
        kind === 'InvalidProblemState'
          ? new InvalidProblemState(field, message)
          : new DomainValidationError(field, message),
      );
      const generic =
        kind === 'InvalidProblemState'
          ? descriptor?.code === PROBLEM_ERROR_CODES.stateInvalid
          : descriptor?.details?.[0]?.code === 'INVALID';
      expect({ message, generic }).toEqual({ message, generic: false });
    }
  });
});
