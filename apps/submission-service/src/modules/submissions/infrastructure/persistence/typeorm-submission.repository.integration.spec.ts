import type {
  PersistedSubmissionRecord,
  SubmitVerdictPersistenceInput,
} from '@submission/modules/submissions/domain/ports/submission-repository.port';
import type { HistoryCursor } from '@submission/modules/submissions/domain/submission-history';
import {
  ACCEPTED_PROGRESS_SCORE,
  SubmissionStatus,
} from '@submission/modules/submissions/domain/submission-record';
import { createSubmitRecord } from '@submission/modules/submissions/domain/submission-record';
import { DataSource } from 'typeorm';

import { SubmissionAcceptedOutbox } from './submission-accepted-outbox.entity';
import { Submission, SubmissionResult } from './submission.entity';
import { TypeormSubmissionRepository } from './typeorm-submission.repository';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const TEST_DATABASE_NAME = TEST_DATABASE_URL
  ? decodeURIComponent(new URL(TEST_DATABASE_URL).pathname.replace(/^\//, ''))
  : '';

if (TEST_DATABASE_URL && !/_test$/.test(TEST_DATABASE_NAME)) {
  throw new Error('TEST_DATABASE_URL must point to a database whose name ends with _test');
}

const describeIntegration = TEST_DATABASE_URL ? describe : describe.skip;

if (!TEST_DATABASE_URL) {
  console.warn(
    'TEST_DATABASE_URL is not set; skipping TypeormSubmissionRepository integration tests',
  );
}

const OWNER_ID = '00000000-0000-4000-8000-000000000021';
const PROBLEM_ID = '6832170d-de82-41f7-a82c-57b71efbf55c';
const NOW = new Date('2026-01-01T00:00:00.000Z');

function submitRecord(now: Date = NOW) {
  return createSubmitRecord({
    userId: OWNER_ID,
    problemId: PROBLEM_ID,
    language: 'python',
    sourceCode: 'print(1)',
    now,
  });
}

function acceptedInput(submissionId: string, eventId: string): SubmitVerdictPersistenceInput {
  return {
    submissionId,
    verdict: {
      status: SubmissionStatus.Accepted,
      score: ACCEPTED_PROGRESS_SCORE,
      passedTests: 3,
      totalTests: 3,
      runtimeMs: 10,
      memoryKb: 1024,
    },
    acceptedEvent: {
      eventId,
      occurredAt: NOW,
      submissionId,
      userId: OWNER_ID,
      problemId: PROBLEM_ID,
      score: ACCEPTED_PROGRESS_SCORE,
    },
    now: NOW,
  };
}

describeIntegration('TypeormSubmissionRepository', () => {
  let dataSource: DataSource;
  let repository: TypeormSubmissionRepository;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: TEST_DATABASE_URL,
      entities: [Submission, SubmissionResult, SubmissionAcceptedOutbox],
      migrations: [`${__dirname}/../../../../database/migrations/*{.ts,.js}`],
      synchronize: false,
    });
    await dataSource.initialize();
    await dataSource.runMigrations();
    repository = new TypeormSubmissionRepository(dataSource.getRepository(Submission), dataSource);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE "submission_accepted_outbox", "submission_results", "submissions" CASCADE',
    );
  });

  it('applies one verdict when two judge results race for the same submission', async () => {
    const saved = await repository.save(submitRecord());

    const results = await Promise.all([
      repository.applySubmitVerdictOnce(
        acceptedInput(saved.id, '0b7a6e1e-1d7f-4c1a-9e7b-000000000001'),
      ),
      repository.applySubmitVerdictOnce(
        acceptedInput(saved.id, '0b7a6e1e-1d7f-4c1a-9e7b-000000000002'),
      ),
    ]);

    expect(results.filter((row) => row !== null)).toHaveLength(1);
    expect(await dataSource.getRepository(SubmissionResult).count()).toBe(1);
    expect(await dataSource.getRepository(SubmissionAcceptedOutbox).count()).toBe(1);
  });

  it('pages through records that share one created_at without repeating or skipping any', async () => {
    const saved: PersistedSubmissionRecord[] = [];
    for (let index = 0; index < 5; index += 1) {
      saved.push(await repository.save(submitRecord()));
    }

    const seen: string[] = [];
    let cursor: HistoryCursor | null = null;
    for (;;) {
      const slice = await repository.listByOwner(OWNER_ID, {}, cursor, 3);
      const page = slice.items.slice(0, 2);
      seen.push(...page.map((item) => item.publicId));
      const last = page.at(-1);
      if (slice.items.length <= 2 || !last) break;
      cursor = { createdAt: last.cursorCreatedAt, publicId: last.publicId };
    }

    expect(seen).toHaveLength(saved.length);
    expect(new Set(seen)).toEqual(new Set(saved.map((record) => record.publicId)));
  });

  it('keeps earlier pages stable when a newer record is saved between two page reads', async () => {
    const saved: PersistedSubmissionRecord[] = [];
    for (let index = 0; index < 5; index += 1) {
      saved.push(await repository.save(submitRecord()));
    }

    const firstSlice = await repository.listByOwner(OWNER_ID, {}, null, 3);
    const firstPage = firstSlice.items.slice(0, 2);
    const last = firstPage.at(-1);
    if (!last) throw new Error('first page is empty');

    await repository.save(submitRecord(new Date('2026-01-02T00:00:00.000Z')));

    const secondSlice = await repository.listByOwner(
      OWNER_ID,
      {},
      { createdAt: last.cursorCreatedAt, publicId: last.publicId },
      3,
    );

    const combined = [...firstPage, ...secondSlice.items].map((item) => item.publicId);
    expect(new Set(combined).size).toBe(combined.length);
    expect(combined.sort()).toEqual(saved.map((record) => record.publicId).sort());
  });
});
