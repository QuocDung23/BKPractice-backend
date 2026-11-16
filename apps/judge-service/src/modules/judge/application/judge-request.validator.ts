import { PROBLEM_TYPES, SUPPORTED_LANGUAGES } from '@app/contracts';
import type { JudgeRequest } from '@app/contracts';

/** Limits approved in JDG-001 (input table) and D-08. */
const MAX_FIELD_BYTES = 1024 * 1024;
const MAX_SUBMIT_TEST_CASES = 100;
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MODES = ['RUN', 'SUBMIT'] as const;

type Correlation = Pick<JudgeRequest, 'executionId' | 'submissionId' | 'mode'>;

export type JudgeRequestValidation =
  | { readonly kind: 'valid'; readonly request: JudgeRequest }
  /** Invalid, but a result can still be correlated (JDG-001-FR-024). */
  | ({ readonly kind: 'rejected' } & Correlation)
  /** Cannot be correlated with any record; the caller drops it. */
  | { readonly kind: 'poison' };

export function validateJudgeRequest(payload: unknown): JudgeRequestValidation {
  if (!isRecord(payload)) return { kind: 'poison' };
  const { executionId, submissionId, mode } = payload;
  if (!isSafeId(executionId) || !isSafeId(submissionId) || !isOneOf(MODES, mode))
    return { kind: 'poison' };

  return hasValidBody(payload, mode)
    ? { kind: 'valid', request: payload as unknown as JudgeRequest }
    : { kind: 'rejected', executionId, submissionId, mode };
}

function hasValidBody(payload: Record<string, unknown>, mode: Correlation['mode']): boolean {
  const { problemType, language, sourceCode, testCases, hiddenHarness } = payload;
  return (
    isOneOf(PROBLEM_TYPES, problemType) &&
    isOneOf(SUPPORTED_LANGUAGES, language) &&
    isBoundedText(sourceCode) &&
    sourceCode.length > 0 &&
    (hiddenHarness === undefined || hiddenHarness === null || isBoundedText(hiddenHarness)) &&
    isPositiveLimit(payload.timeLimitMs) &&
    isPositiveLimit(payload.memoryLimitMb) &&
    Array.isArray(testCases) &&
    testCases.length > 0 &&
    (mode === 'RUN' || testCases.length <= MAX_SUBMIT_TEST_CASES) &&
    testCases.every((testCase) => isValidTestCase(testCase, mode))
  );
}

function isValidTestCase(testCase: unknown, mode: Correlation['mode']): boolean {
  if (!isRecord(testCase) || !isBoundedText(testCase.stdin)) return false;
  const { expectedOutput, score } = testCase;
  if (mode === 'RUN') return expectedOutput === undefined || isBoundedText(expectedOutput);
  return isBoundedText(expectedOutput) && Number.isSafeInteger(score) && (score as number) >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_ID.test(value);
}

function isOneOf<T extends string>(allowed: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && allowed.includes(value as T);
}

function isBoundedText(value: unknown): value is string {
  return typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= MAX_FIELD_BYTES;
}

function isPositiveLimit(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
