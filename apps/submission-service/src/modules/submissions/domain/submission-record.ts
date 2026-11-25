export enum SubmissionKind {
  Run = 'RUN',
  Submit = 'SUBMIT',
}

export enum SubmissionStatus {
  Pending = 'PENDING',
  Queued = 'QUEUED',
  Running = 'RUNNING',
  Executed = 'EXECUTED',
  Accepted = 'ACCEPTED',
  WrongAnswer = 'WRONG_ANSWER',
  CompileError = 'COMPILE_ERROR',
  RuntimeError = 'RUNTIME_ERROR',
  TimeLimitExceeded = 'TIME_LIMIT_EXCEEDED',
  MemoryLimitExceeded = 'MEMORY_LIMIT_EXCEEDED',
  InternalError = 'INTERNAL_ERROR',
}

export const PROBLEM_SUBMISSION_STATES = ['READY', 'JUDGING', 'SOLVED'] as const;

export interface ProblemSubmissionState {
  readonly state: (typeof PROBLEM_SUBMISSION_STATES)[number];
  readonly submissionId: string | null;
}

export interface SubmissionRecord {
  readonly id: string | null;
  readonly publicId: string | null;
  readonly userId: string;
  readonly problemId: string | null;
  readonly kind: SubmissionKind;
  readonly language: string;
  readonly sourceCode: string;
  readonly stdin: string;
  readonly status: SubmissionStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateRunRecordInput {
  readonly userId: string;
  readonly problemId?: string | null;
  readonly language: string;
  readonly sourceCode: string;
  readonly stdin: string;
  readonly now: Date;
}

export class InvalidSubmissionTransitionError extends Error {
  readonly code = 'INVALID_SUBMISSION_TRANSITION';

  constructor(record: SubmissionRecord, target: SubmissionStatus) {
    super(`Cannot transition ${record.kind} submission from ${record.status} to ${target}`);
    this.name = 'InvalidSubmissionTransitionError';
  }
}

export function createRunRecord(input: CreateRunRecordInput): SubmissionRecord {
  return {
    id: null,
    publicId: null,
    userId: input.userId,
    problemId: input.problemId ?? null,
    kind: SubmissionKind.Run,
    language: input.language,
    sourceCode: input.sourceCode,
    stdin: input.stdin,
    status: SubmissionStatus.Pending,
    createdAt: new Date(input.now),
    updatedAt: new Date(input.now),
  };
}

export interface CreateSubmitRecordInput {
  readonly userId: string;
  readonly problemId: string;
  readonly language: string;
  readonly sourceCode: string;
  readonly now: Date;
}

export type NewOfficialSubmission = SubmissionRecord & {
  readonly id: null;
  readonly publicId: null;
  readonly problemId: string;
  readonly kind: SubmissionKind.Submit;
};

export function createSubmitRecord(input: CreateSubmitRecordInput): NewOfficialSubmission {
  return {
    id: null,
    publicId: null,
    userId: input.userId,
    problemId: input.problemId,
    kind: SubmissionKind.Submit,
    language: input.language,
    sourceCode: input.sourceCode,
    stdin: '',
    status: SubmissionStatus.Pending,
    createdAt: new Date(input.now),
    updatedAt: new Date(input.now),
  };
}

export type TerminalSubmissionStatus = Exclude<
  SubmissionStatus,
  SubmissionStatus.Pending | SubmissionStatus.Queued | SubmissionStatus.Running
>;

export function isTerminal(status: SubmissionStatus): status is TerminalSubmissionStatus {
  return ![SubmissionStatus.Pending, SubmissionStatus.Queued, SubmissionStatus.Running].includes(
    status,
  );
}

export function canProduceWrongAnswer(kind: SubmissionKind): boolean {
  return kind === SubmissionKind.Submit;
}

export type SubmitVerdictStatus = Exclude<TerminalSubmissionStatus, SubmissionStatus.Executed>;

// A Judge score may be missing; null keeps "not reported" distinct from a real 0.
export type DecidingScore = number | null;

export interface SubmitVerdict {
  readonly status: SubmitVerdictStatus;
  readonly score: DecidingScore;
  readonly passedTests: number | null;
  readonly totalTests: number | null;
  readonly runtimeMs: number | null;
  readonly memoryKb: number | null;
}

// LRN-006 fixes the progress score of every officially accepted submission.
export const ACCEPTED_PROGRESS_SCORE = 100;

const submitVerdictStatuses: readonly SubmitVerdictStatus[] = [
  SubmissionStatus.Accepted,
  SubmissionStatus.WrongAnswer,
  SubmissionStatus.CompileError,
  SubmissionStatus.RuntimeError,
  SubmissionStatus.TimeLimitExceeded,
  SubmissionStatus.MemoryLimitExceeded,
  SubmissionStatus.InternalError,
];

export function toJudgeVerdictStatus(judgeStatus: string): SubmitVerdictStatus | null {
  return submitVerdictStatuses.find((status: string) => status === judgeStatus) ?? null;
}

export function applyVerdict(
  record: SubmissionRecord,
  verdict: SubmitVerdict,
  now: Date,
): SubmissionRecord {
  if (record.kind !== SubmissionKind.Submit || isTerminal(record.status)) {
    throw new InvalidSubmissionTransitionError(record, verdict.status);
  }

  return {
    ...record,
    status: verdict.status,
    updatedAt: new Date(now),
  };
}

export function isOfficiallyAccepted<T extends SubmissionRecord>(
  record: T,
): record is T & { readonly problemId: string } {
  return (
    record.kind === SubmissionKind.Submit &&
    record.status === SubmissionStatus.Accepted &&
    record.problemId !== null
  );
}
