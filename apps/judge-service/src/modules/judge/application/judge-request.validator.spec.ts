import type { JudgeRequest } from '@app/contracts';

import { validateJudgeRequest } from './judge-request.validator';

const MIB = 1024 * 1024;

const submit: JudgeRequest = {
  executionId: '5f0c1f0e-6f43-4d59-9d0e-2f0b8f6f7a01',
  submissionId: '5f0c1f0e-6f43-4d59-9d0e-2f0b8f6f7a02',
  mode: 'SUBMIT',
  problemType: 'STANDARD',
  language: 'cpp',
  sourceCode: 'int main(){}',
  testCases: [{ stdin: '1', expectedOutput: '1', score: 10 }],
  timeLimitMs: 1000,
  memoryLimitMb: 128,
};

const ids = {
  executionId: submit.executionId,
  submissionId: submit.submissionId,
  mode: submit.mode,
};

describe('validateJudgeRequest', () => {
  it('accepts a valid Submit request', () => {
    expect(validateJudgeRequest(submit)).toEqual({ kind: 'valid', request: submit });
  });

  it('accepts a Run request with one test case and no expected output', () => {
    const run = { ...submit, mode: 'RUN', testCases: [{ stdin: '' }] };
    expect(validateJudgeRequest(run)).toMatchObject({ kind: 'valid' });
  });

  it.each([
    ['not an object', 'text'],
    ['null', null],
    ['missing executionId', { ...submit, executionId: undefined }],
    ['empty submissionId', { ...submit, submissionId: '' }],
    ['id with path characters', { ...submit, executionId: '../../etc' }],
    ['unknown mode', { ...submit, mode: 'REJUDGE' }],
  ])('treats %s as a poison message', (_name, payload) => {
    expect(validateJudgeRequest(payload)).toEqual({ kind: 'poison' });
  });

  it.each<[string, Record<string, unknown>]>([
    ['unknown problem type', { problemType: 'ESSAY' }],
    ['unapproved language', { language: 'ruby' }],
    ['non-string source', { sourceCode: 42 }],
    ['empty source', { sourceCode: '' }],
    ['source over 1 MiB', { sourceCode: 'a'.repeat(MIB + 1) }],
    ['multi-byte source over 1 MiB', { sourceCode: 'é'.repeat(MIB / 2 + 1) }],
    ['test cases not an array', { testCases: 'none' }],
    ['empty test cases', { testCases: [] }],
    ['more than 100 Submit test cases', { testCases: Array(101).fill(submit.testCases[0]) }],
    ['non-string stdin', { testCases: [{ stdin: 1, expectedOutput: '1', score: 1 }] }],
    [
      'stdin over 1 MiB',
      { testCases: [{ stdin: 'a'.repeat(MIB + 1), expectedOutput: '', score: 1 }] },
    ],
    ['Submit without expected output', { testCases: [{ stdin: '1', score: 1 }] }],
    ['negative score', { testCases: [{ stdin: '1', expectedOutput: '1', score: -1 }] }],
    ['fractional score', { testCases: [{ stdin: '1', expectedOutput: '1', score: 0.5 }] }],
    ['Submit without score', { testCases: [{ stdin: '1', expectedOutput: '1' }] }],
    ['zero time limit', { timeLimitMs: 0 }],
    ['non-numeric memory limit', { memoryLimitMb: '128' }],
    ['infinite time limit', { timeLimitMs: Number.POSITIVE_INFINITY }],
    ['non-string harness', { hiddenHarness: 7 }],
  ])('rejects %s but keeps the identifiers for correlation', (_name, override) => {
    expect(validateJudgeRequest({ ...submit, ...override })).toEqual({ kind: 'rejected', ...ids });
  });

  it('accepts a Submit test case with score 0', () => {
    const request = { ...submit, testCases: [{ stdin: '1', expectedOutput: '1', score: 0 }] };
    expect(validateJudgeRequest(request)).toMatchObject({ kind: 'valid' });
  });

  it('accepts exactly 100 Submit test cases and a source of exactly 1 MiB', () => {
    const request = {
      ...submit,
      sourceCode: 'a'.repeat(MIB),
      testCases: Array(100).fill(submit.testCases[0]),
    };
    expect(validateJudgeRequest(request)).toMatchObject({ kind: 'valid' });
  });
});
