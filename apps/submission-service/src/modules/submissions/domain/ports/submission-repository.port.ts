import type {
  HistoryCursor,
  SubmissionHistoryFilter,
} from '@submission/modules/submissions/domain/submission-history';
import type {
  NewOfficialSubmission,
  ProblemSubmissionState,
  SubmissionKind,
  SubmissionRecord,
  SubmissionStatus,
  SubmitVerdict,
} from '@submission/modules/submissions/domain/submission-record';

import type { AcceptedProgressEvent } from './accepted-event.port';

export const SUBMISSION_REPOSITORY_PORT = Symbol('SubmissionRepositoryPort');

export interface PersistedSubmissionRecord extends SubmissionRecord {
  readonly id: string;
  readonly publicId: string;
}

export interface SubmissionExecutionError {
  readonly line?: number;
  readonly column?: number;
  readonly message: string;
}

export interface RunResultPersistenceInput {
  readonly submissionId: string;
  readonly status: SubmissionStatus;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly compileOutput?: string;
  readonly error?: SubmissionExecutionError;
  readonly runtimeMs?: number;
  readonly memoryKb?: number;
}

export interface SubmitVerdictPersistenceInput {
  readonly submissionId: string;
  readonly verdict: SubmitVerdict;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly compileOutput?: string;
  readonly error?: SubmissionExecutionError;
  readonly acceptedEvent: AcceptedProgressEvent | null;
  readonly now: Date;
}

/** A list row: no source code or raw output is ever loaded for history pages. */
export interface SubmissionHistoryRecord {
  readonly publicId: string;
  readonly userId: string;
  readonly problemId: string | null;
  readonly kind: SubmissionKind;
  readonly language: string;
  readonly sourceCodeSize: number;
  readonly status: SubmissionStatus;
  readonly score: number | null;
  readonly passedTests: number | null;
  readonly totalTests: number | null;
  readonly runtimeMs: number | null;
  readonly memoryKb: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /** `createdAt` at full database precision, used as the next keyset cursor. */
  readonly cursorCreatedAt: string;
}

export interface SubmissionHistorySlice {
  readonly items: readonly SubmissionHistoryRecord[];
  /** Exact number of the owner's records matching the filter, ignoring the cursor. */
  readonly total: number;
}

export interface SubmissionDetailRecord extends PersistedSubmissionRecord {
  readonly score: number | null;
  readonly passedTests: number | null;
  readonly totalTests: number | null;
  readonly runtimeMs: number | null;
  readonly memoryKb: number | null;
  readonly result: {
    readonly stdout: string | null;
    readonly stderr: string | null;
    readonly compileOutput: string | null;
    readonly error: SubmissionExecutionError | null;
  } | null;
}

export interface SubmissionRepositoryPort {
  save(record: SubmissionRecord): Promise<PersistedSubmissionRecord>;
  saveOfficialSubmission(record: NewOfficialSubmission): Promise<PersistedSubmissionRecord>;
  getProblemSubmissionState(userId: string, problemId: string): Promise<ProblemSubmissionState>;
  findById(id: string): Promise<PersistedSubmissionRecord | null>;
  /**
   * Owner first, then the filter, ordered `createdAt DESC, publicId DESC`, starting after `cursor`.
   * No parameter can widen the result beyond `ownerId`.
   */
  listByOwner(
    ownerId: string,
    filter: SubmissionHistoryFilter,
    cursor: HistoryCursor | null,
    take: number,
  ): Promise<SubmissionHistorySlice>;
  findByPublicIdAndOwner(
    publicIdOrLegacyId: string,
    ownerId: string,
  ): Promise<SubmissionDetailRecord | null>;
  /**
   * Status transitions are enforced here as conditional updates, so a concurrent writer can never
   * overwrite a newer state. Both transitions apply only to a PENDING record, of either kind.
   */
  markQueued(id: string, now: Date): Promise<PersistedSubmissionRecord | null>;
  markFailedToDispatch(id: string, now: Date): Promise<PersistedSubmissionRecord | null>;
  applyRunResultOnce(input: RunResultPersistenceInput): Promise<PersistedSubmissionRecord | null>;
  /** Writes the verdict, result and outbox row atomically; null when the record was already terminal. */
  applySubmitVerdictOnce(
    input: SubmitVerdictPersistenceInput,
  ): Promise<PersistedSubmissionRecord | null>;
  expireStaleSubmissions(cutoff: Date, now: Date): Promise<readonly PersistedSubmissionRecord[]>;
}
