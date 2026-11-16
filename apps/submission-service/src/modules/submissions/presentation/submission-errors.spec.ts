import {
  SUBMISSION_ERRORS,
  createSubmissionError,
  createSubmissionIdInvalidError,
} from './submission-errors';

describe('SUBMISSION_ERRORS', () => {
  it.each([
    ['userContextMissing', 401, 'AUTH_USER_CONTEXT_MISSING'],
    ['internalSecretInvalid', 401, 'AUTH_INTERNAL_SECRET_INVALID'],
    ['problemNotSubmittable', 404, 'SUBMISSION_PROBLEM_NOT_SUBMITTABLE'],
    ['judgePackageUnavailable', 503, 'SUBMISSION_JUDGE_PACKAGE_UNAVAILABLE'],
    ['submissionNotFound', 404, 'SUBMISSION_NOT_FOUND'],
    ['submissionIdInvalid', 400, 'VALIDATION_FAILED'],
  ] as const)('%s keeps its historical status and stable code', (key, status, code) => {
    const error = createSubmissionError(SUBMISSION_ERRORS[key]);
    expect(error.getStatus()).toBe(status);
    expect(error.code).toBe(code);
    expect(error.message).toMatch(/[ăâêôơưđ]/i);
  });

  it('gives every error a distinct code, except the shared validation code', () => {
    const codes = Object.values(SUBMISSION_ERRORS)
      .map((definition) => definition.code)
      .filter((code) => code !== 'VALIDATION_FAILED');
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('reports the invalid publicId field for a malformed submission id', () => {
    expect(createSubmissionIdInvalidError().details).toEqual([
      expect.objectContaining({ field: 'publicId', code: 'INVALID_FORMAT' }),
    ]);
  });
});
