import type { SupportedLanguage } from '@app/contracts';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { AcceptedEventOutboxPort } from '@submission/modules/submissions/domain/ports/accepted-event-outbox.port';
import type { AcceptedProgressEvent } from '@submission/modules/submissions/domain/ports/accepted-event.port';
import type {
  PersistedSubmissionRecord,
  RunResultPersistenceInput,
  SubmissionDetailRecord,
  SubmissionHistoryRecord,
  SubmissionHistorySlice,
  SubmissionRepositoryPort,
  SubmitVerdictPersistenceInput,
} from '@submission/modules/submissions/domain/ports/submission-repository.port';
import type {
  HistoryCursor,
  SubmissionHistoryFilter,
} from '@submission/modules/submissions/domain/submission-history';
import type { SubmissionRecord } from '@submission/modules/submissions/domain/submission-record';
import {
  SubmissionKind,
  SubmissionStatus,
  isTerminal,
} from '@submission/modules/submissions/domain/submission-record';
import { DataSource, IsNull, Repository } from 'typeorm';

import { SubmissionAcceptedOutbox } from './submission-accepted-outbox.entity';
import { Submission, SubmissionResult } from './submission.entity';

const openStatuses = [SubmissionStatus.Pending, SubmissionStatus.Queued, SubmissionStatus.Running];

@Injectable()
export class TypeormSubmissionRepository
  implements SubmissionRepositoryPort, AcceptedEventOutboxPort
{
  constructor(
    @InjectRepository(Submission) private readonly submissions: Repository<Submission>,
    private readonly dataSource: DataSource,
  ) {}

  async save(record: SubmissionRecord): Promise<PersistedSubmissionRecord> {
    const entity = this.submissions.create({
      ...(record.id ? { id: record.id } : {}),
      ...(record.publicId ? { publicId: record.publicId } : {}),
      userId: record.userId,
      problemId: record.problemId,
      kind: record.kind,
      language: record.language as SupportedLanguage,
      sourceCode: record.sourceCode,
      stdin: record.stdin,
      status: record.status,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
    return this.toRecord(await this.submissions.save(entity));
  }

  async findById(id: string): Promise<PersistedSubmissionRecord | null> {
    const entity = await this.submissions.findOneBy({ id });
    return entity ? this.toRecord(entity) : null;
  }

  async listByOwner(
    ownerId: string,
    filter: SubmissionHistoryFilter,
    cursor: HistoryCursor | null,
    take: number,
  ): Promise<SubmissionHistorySlice> {
    // The owner condition is always first and never optional; filter and cursor only narrow it.
    const params: unknown[] = [ownerId];
    const conditions = ['"user_id" = $1'];
    if (filter.kind !== undefined) {
      params.push(filter.kind);
      conditions.push(`"kind" = $${params.length}`);
    }
    if (filter.problemId !== undefined) {
      params.push(filter.problemId);
      conditions.push(`"problem_id" = $${params.length}`);
    }
    const [{ count }] = await this.submissions.query<[{ count: number }]>(
      `SELECT COUNT(*)::int AS "count" FROM "submissions" WHERE ${conditions.join(' AND ')}`,
      [...params],
    );

    if (cursor) {
      params.push(cursor.createdAt, cursor.publicId);
      const at = `$${params.length - 1}::timestamptz`;
      const id = `$${params.length}::uuid`;
      // Compound keyset condition: comparing created_at alone would skip or repeat ties.
      conditions.push(`("created_at" < ${at} OR ("created_at" = ${at} AND "public_id" < ${id}))`);
    }
    params.push(take);
    const rows = await this.submissions.query<RawHistoryRow[]>(
      `SELECT "public_id", "user_id", "problem_id", "kind", "language",
              LENGTH("source_code")::int AS "source_code_size", "status", "score",
              "passed_tests", "total_tests", "runtime_ms", "memory_kb", "created_at", "updated_at",
              to_char("created_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
                AS "cursor_created_at"
       FROM "submissions"
       WHERE ${conditions.join(' AND ')}
       ORDER BY "created_at" DESC, "public_id" DESC
       LIMIT $${params.length}`,
      params,
    );
    return { items: rows.map((row) => this.fromRawHistoryRow(row)), total: count };
  }

  async findByPublicIdAndOwner(
    publicIdOrLegacyId: string,
    ownerId: string,
  ): Promise<SubmissionDetailRecord | null> {
    const entity =
      (await this.submissions.findOne({
        where: { publicId: publicIdOrLegacyId, userId: ownerId },
        relations: { result: true },
      })) ??
      (await this.submissions.findOne({
        where: { id: publicIdOrLegacyId, userId: ownerId },
        relations: { result: true },
      }));
    return entity ? this.toDetailRecord(entity) : null;
  }

  markQueued(id: string, now: Date): Promise<PersistedSubmissionRecord | null> {
    return this.transitionPending(id, SubmissionStatus.Queued, now);
  }

  markFailedToDispatch(id: string, now: Date): Promise<PersistedSubmissionRecord | null> {
    return this.transitionPending(id, SubmissionStatus.InternalError, now);
  }

  applyRunResultOnce(input: RunResultPersistenceInput): Promise<PersistedSubmissionRecord | null> {
    return this.dataSource.transaction(async (manager) => {
      const submission = await manager.findOne(Submission, {
        where: { id: input.submissionId, kind: SubmissionKind.Run },
        lock: { mode: 'pessimistic_write' },
      });
      if (!submission || isTerminal(submission.status)) return null;

      submission.status = input.status;
      submission.runtimeMs = input.runtimeMs ?? null;
      submission.memoryKb = input.memoryKb ?? null;
      await manager.save(Submission, submission);
      await manager.save(
        SubmissionResult,
        manager.create(SubmissionResult, {
          submission,
          stdout: input.stdout ?? null,
          stderr: input.stderr ?? null,
          compileOutput: input.compileOutput ?? null,
          error: input.error ?? null,
        }),
      );
      return this.toRecord(submission);
    });
  }

  // The conditional UPDATE is the single winner check: redelivered or concurrent results
  // affect zero rows, so no second result row or outbox row can be written.
  applySubmitVerdictOnce(
    input: SubmitVerdictPersistenceInput,
  ): Promise<PersistedSubmissionRecord | null> {
    const { verdict, acceptedEvent } = input;
    return this.dataSource.transaction(async (manager) => {
      const updated = await manager
        .createQueryBuilder()
        .update(Submission)
        .set({
          status: verdict.status,
          score: verdict.score,
          passedTests: verdict.passedTests,
          totalTests: verdict.totalTests,
          runtimeMs: verdict.runtimeMs,
          memoryKb: verdict.memoryKb,
          acceptedEventId: acceptedEvent?.eventId ?? null,
          updatedAt: input.now,
        })
        .where('id = :id AND kind = :kind AND status IN (:...openStatuses)', {
          id: input.submissionId,
          kind: SubmissionKind.Submit,
          openStatuses,
        })
        .returning('*')
        .execute();
      const [row] = updated.raw as RawSubmissionRow[];
      if (!row) return null;

      await manager.insert(SubmissionResult, {
        submission: { id: input.submissionId },
        stdout: input.stdout ?? null,
        stderr: input.stderr ?? null,
        compileOutput: input.compileOutput ?? null,
        error: input.error ?? null,
      });
      if (acceptedEvent) {
        await manager.insert(SubmissionAcceptedOutbox, {
          eventId: acceptedEvent.eventId,
          submissionId: acceptedEvent.submissionId,
          payload: { ...acceptedEvent, occurredAt: acceptedEvent.occurredAt.toISOString() },
        });
      }
      return this.fromRawRow(row);
    });
  }

  // SKIP LOCKED lets several instances relay in parallel without publishing the same row at once.
  relayOldestPendingAcceptedEvent(
    publish: (event: AcceptedProgressEvent) => Promise<void>,
  ): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const pending = await manager.findOne(SubmissionAcceptedOutbox, {
        where: { publishedAt: IsNull() },
        order: { createdAt: 'ASC' },
        lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' },
      });
      if (!pending) return false;

      await publish({ ...pending.payload, occurredAt: new Date(pending.payload.occurredAt) });
      await manager.update(
        SubmissionAcceptedOutbox,
        { eventId: pending.eventId },
        { publishedAt: new Date() },
      );
      return true;
    });
  }

  async expireStaleSubmissions(
    cutoff: Date,
    now: Date,
  ): Promise<readonly PersistedSubmissionRecord[]> {
    // TypeORM's PostgreSQL driver returns [rows, affected] for raw UPDATE statements.
    const [rows] = await this.submissions.query<[RawSubmissionRow[], number]>(
      `UPDATE "submissions"
       SET "status" = $1, "updated_at" = $2
       WHERE "status" IN ($3, $4)
         AND "created_at" <= $5
       RETURNING "id", "public_id", "user_id", "problem_id", "kind", "language",
                 "source_code", "stdin", "status", "created_at", "updated_at"`,
      [
        SubmissionStatus.InternalError,
        now,
        SubmissionStatus.Pending,
        SubmissionStatus.Queued,
        cutoff,
      ],
    );
    return rows.map((row) => this.fromRawRow(row));
  }

  private async transitionPending(
    id: string,
    status: SubmissionStatus,
    now: Date,
  ): Promise<PersistedSubmissionRecord | null> {
    const result = await this.submissions.update(
      { id, status: SubmissionStatus.Pending },
      { status, updatedAt: now },
    );
    if (result.affected !== 1) return null;
    return this.findById(id);
  }

  private toRecord(entity: Submission): PersistedSubmissionRecord {
    return {
      id: entity.id,
      publicId: entity.publicId,
      userId: entity.userId,
      problemId: entity.problemId,
      kind: entity.kind,
      language: entity.language,
      sourceCode: entity.sourceCode,
      stdin: entity.stdin ?? '',
      status: entity.status,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  private toDetailRecord(entity: Submission): SubmissionDetailRecord {
    return {
      ...this.toRecord(entity),
      score: entity.score,
      passedTests: entity.passedTests,
      totalTests: entity.totalTests,
      runtimeMs: entity.runtimeMs,
      memoryKb: entity.memoryKb,
      result: entity.result
        ? {
            stdout: entity.result.stdout,
            stderr: entity.result.stderr,
            compileOutput: entity.result.compileOutput,
            error: entity.result.error,
          }
        : null,
    };
  }

  private fromRawHistoryRow(row: RawHistoryRow): SubmissionHistoryRecord {
    return {
      publicId: row.public_id,
      userId: row.user_id,
      problemId: row.problem_id,
      kind: row.kind,
      language: row.language,
      sourceCodeSize: row.source_code_size,
      status: row.status,
      score: row.score,
      passedTests: row.passed_tests,
      totalTests: row.total_tests,
      runtimeMs: row.runtime_ms,
      memoryKb: row.memory_kb,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      cursorCreatedAt: row.cursor_created_at,
    };
  }

  private fromRawRow(row: RawSubmissionRow): PersistedSubmissionRecord {
    return {
      id: row.id,
      publicId: row.public_id,
      userId: row.user_id,
      problemId: row.problem_id,
      kind: row.kind,
      language: row.language,
      sourceCode: row.source_code,
      stdin: row.stdin ?? '',
      status: row.status,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

interface RawHistoryRow {
  readonly public_id: string;
  readonly user_id: string;
  readonly problem_id: string | null;
  readonly kind: SubmissionKind;
  readonly language: string;
  readonly source_code_size: number;
  readonly status: SubmissionStatus;
  readonly score: number | null;
  readonly passed_tests: number | null;
  readonly total_tests: number | null;
  readonly runtime_ms: number | null;
  readonly memory_kb: number | null;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
  readonly cursor_created_at: string;
}

interface RawSubmissionRow {
  readonly id: string;
  readonly public_id: string;
  readonly user_id: string;
  readonly problem_id: string | null;
  readonly kind: SubmissionKind;
  readonly language: string;
  readonly source_code: string;
  readonly stdin: string | null;
  readonly status: SubmissionStatus;
  readonly created_at: Date | string;
  readonly updated_at: Date | string;
}
