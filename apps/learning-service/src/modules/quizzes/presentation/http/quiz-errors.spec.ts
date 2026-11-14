import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { UnauthorizedError } from '@/modules/problems/application/errors/unauthorized.error';
import { QuizError } from '@/modules/quizzes/domain';
import {
  QUIZ_ERROR_CODES,
  describeQuizException,
} from '@/modules/quizzes/presentation/http/quiz-errors';

const QUIZZES_ROOT = join(__dirname, '..', '..');
const KIND_STATUS = {
  INVALID: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNAVAILABLE: 503,
};
const GENERIC_CODES: ReadonlySet<string> = new Set([
  QUIZ_ERROR_CODES.invalidRequest,
  QUIZ_ERROR_CODES.forbidden,
  QUIZ_ERROR_CODES.notFoundGeneric,
  QUIZ_ERROR_CODES.conflict,
  QUIZ_ERROR_CODES.dependencyUnavailable,
]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return name === 'testing' ? [] : sourceFiles(path);
    return name.endsWith('.ts') && !name.endsWith('.spec.ts') ? [path] : [];
  });
}

describe('quiz error catalog', () => {
  it('uses a unique code for every error', () => {
    const codes = Object.values(QUIZ_ERROR_CODES);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it.each([
    [
      'NOT_FOUND',
      'Attempt not found',
      404,
      'QUIZ_ATTEMPT_NOT_FOUND',
      'Không tìm thấy lượt làm bài này.',
    ],
    [
      'CONFLICT',
      'Answer every question before finishing',
      409,
      'QUIZ_ATTEMPT_INCOMPLETE',
      'Bạn cần trả lời tất cả các câu hỏi trước khi nộp bài.',
    ],
    [
      'FORBIDDEN',
      'Only the owner can edit this content',
      403,
      'QUIZ_NOT_OWNER',
      'Nội dung này do người khác tạo. Chỉ người tạo mới chỉnh sửa được.',
    ],
    ['UNAVAILABLE', 'Identity is unavailable', 503, 'QUIZ_SHARE_DEPENDENCY_UNAVAILABLE', undefined],
    [
      'INVALID',
      'A question requires 2–6 options',
      400,
      'QUIZ_OPTIONS_COUNT_INVALID',
      'Mỗi câu hỏi cần có từ 2 đến 6 đáp án.',
    ],
  ] as const)('maps %s "%s" to %i %s', (kind, message, status, code, expected) => {
    const descriptor = describeQuizException(new QuizError(kind, message));

    expect(descriptor).toMatchObject({ status, code });
    if (expected) expect(descriptor?.message).toBe(expected);
  });

  it('names the field for text validation failures', () => {
    expect(describeQuizException(new QuizError('INVALID', 'Invalid title'))).toMatchObject({
      status: 400,
      code: 'QUIZ_FIELD_INVALID',
      message: 'Trường tiêu đề không hợp lệ: để trống hoặc quá dài.',
      details: [{ field: 'title', code: 'INVALID' }],
    });
    expect(describeQuizException(new QuizError('INVALID', 'Unsafe content'))).toMatchObject({
      code: 'QUIZ_CONTENT_UNSAFE',
    });
  });

  it('falls back to a Vietnamese sentence of the right kind for an unlisted message', () => {
    const descriptor = describeQuizException(new QuizError('CONFLICT', 'some new english text'));

    expect(descriptor).toEqual({
      status: 409,
      code: 'QUIZ_CONFLICT',
      message: 'Trạng thái hiện tại không cho phép thao tác này.',
    });
  });

  it('maps a missing principal to the shared auth error', () => {
    expect(describeQuizException(new UnauthorizedError())).toMatchObject({
      status: 401,
      code: 'AUTH_PRINCIPAL_INVALID',
    });
  });

  it('returns null for errors that are not quiz errors', () => {
    expect(describeQuizException(new Error('boom'))).toBeNull();
  });

  it('knows every literal QuizError message that the quizzes module throws today', () => {
    const found: Array<{ kind: keyof typeof KIND_STATUS; message: string }> = [];
    const pattern =
      /new QuizError\(\s*'(INVALID|FORBIDDEN|NOT_FOUND|CONFLICT|UNAVAILABLE)',\s*'([^']+)'\s*,?\s*\)/g;
    const requireValue = /requireValue\([^;]*?,\s*'([^']+)',?\s*\)/gs;
    for (const file of sourceFiles(QUIZZES_ROOT)) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(pattern)) {
        found.push({ kind: match[1] as keyof typeof KIND_STATUS, message: match[2] ?? '' });
      }
      for (const match of text.matchAll(requireValue)) {
        found.push({ kind: 'INVALID', message: match[1] ?? '' });
      }
    }

    expect(found.length).toBeGreaterThan(40);
    for (const { kind, message } of found) {
      const descriptor = describeQuizException(new QuizError(kind, message));
      expect({
        message,
        status: descriptor?.status,
        generic: GENERIC_CODES.has(descriptor?.code ?? ''),
      }).toEqual({
        message,
        status: KIND_STATUS[kind],
        generic: false,
      });
    }
  });
});
