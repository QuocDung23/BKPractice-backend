import { randomUUID } from 'node:crypto';

import {
  assertTestDatabase,
  learningDataSourceOptions,
  TEST_DATABASE_URL,
  upsertProblem,
} from '@learning/modules/courses/testing/course-db.helpers';
import { LeaderboardReaders } from '@learning/modules/leaderboard/leaderboard-readers';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

import { ApplyAcceptedSubmissionUseCase } from '@/modules/progress/application/use-cases';
import type { ProgressRepository } from '@/modules/progress/domain/repositories';
import { ProgressTransactionContext } from '@/modules/progress/infrastructure/persistence/progress-transaction-context';
import { ProgressTransactionRunner } from '@/modules/progress/infrastructure/persistence/progress-transaction-runner';
import { ProgressTypeOrmRepository } from '@/modules/progress/infrastructure/persistence/progress.typeorm-repository';

assertTestDatabase();
const describeIntegration = TEST_DATABASE_URL ? describe : describe.skip;

describeIntegration('Progress accepted event persistence (real PostgreSQL)', () => {
  let dataSource: DataSource;
  let useCase: ApplyAcceptedSubmissionUseCase;
  let repository: ProgressTypeOrmRepository;
  let runner: ProgressTransactionRunner;
  const userId = randomUUID();
  const problemId = randomUUID();

  beforeAll(async () => {
    dataSource = new DataSource(learningDataSourceOptions());
    await dataSource.initialize();
    await dataSource.runMigrations();
    await upsertProblem(dataSource, { id: problemId });
    const context = new ProgressTransactionContext(dataSource);
    repository = new ProgressTypeOrmRepository(context);
    runner = new ProgressTransactionRunner(context);
    useCase = new ApplyAcceptedSubmissionUseCase(repository, runner);
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    await dataSource.query('DELETE FROM progress_event_receipts WHERE user_id = $1', [userId]);
    await dataSource.query('DELETE FROM progress WHERE user_id = $1', [userId]);
    await dataSource.query('DELETE FROM problems WHERE id = $1', [problemId]);
    await dataSource.destroy();
  });

  it('applies concurrent events once and keeps the earliest time and highest score', async () => {
    const first = {
      eventId: randomUUID(),
      submissionId: randomUUID(),
      userId,
      problemId,
      occurredAt: '2026-01-03T00:00:00.000Z',
      score: 100,
    };
    const second = {
      ...first,
      eventId: randomUUID(),
      submissionId: randomUUID(),
      occurredAt: '2026-01-01T00:00:00.000Z',
      score: 40,
    };

    expect(await Promise.all([useCase.execute(first), useCase.execute(second)])).toEqual([
      'APPLIED',
      'APPLIED',
    ]);
    expect(await useCase.execute(first)).toBe('DUPLICATE');

    const rows: Array<{ best_score: number; solved_at: Date; awarded_xp: number }> =
      await dataSource.query(
        'SELECT best_score, solved_at, awarded_xp FROM progress WHERE user_id = $1 AND problem_id = $2',
        [userId, problemId],
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.best_score).toBe(100);
    expect(rows[0]?.solved_at).toEqual(new Date(second.occurredAt));
    expect(rows[0]?.awarded_xp).toBe(10);

    await dataSource.query("UPDATE problems SET difficulty = 'HARD' WHERE id = $1", [problemId]);
    const repeated = { ...first, eventId: randomUUID(), submissionId: randomUUID(), score: 60 };
    expect(
      (await Promise.all([useCase.execute(repeated), useCase.execute(repeated)])).sort(),
    ).toEqual(['APPLIED', 'DUPLICATE']);
    expect(
      await dataSource.query(
        'SELECT awarded_xp FROM progress WHERE user_id = $1 AND problem_id = $2',
        [userId, problemId],
      ),
    ).toEqual([{ awarded_xp: 10 }]);

    const reader = new LeaderboardReaders(dataSource, new ConfigService());
    const from = new Date(second.occurredAt);
    const to = new Date(Date.parse(first.occurredAt) + 1);
    expect((await reader.listScores(from, to)).find((score) => score.userId === userId)).toEqual({
      userId,
      solved: 1,
      xp: 10,
      lastSolvedAt: from,
    });
    expect(
      (await reader.listScores(new Date(from.getTime() - 1), from)).some(
        (score) => score.userId === userId,
      ),
    ).toBe(false);
    await dataSource.query("UPDATE problems SET publish_status = 'ON_HOLD' WHERE id = $1", [
      problemId,
    ]);
    expect((await reader.listScores(from, to)).some((score) => score.userId === userId)).toBe(
      false,
    );
  });

  it('rolls back the receipt when progress persistence fails, then accepts a retry', async () => {
    const event = {
      eventId: randomUUID(),
      submissionId: randomUUID(),
      userId,
      problemId,
      occurredAt: '2026-01-02T00:00:00.000Z',
      score: 50,
    };
    const failingRepository: ProgressRepository = {
      findSolved: (userId, ids) => repository.findSolved(userId, ids),
      listSolved: (userId, page, limit) => repository.listSolved(userId, page, limit),
      recordReceipt: (value) => repository.recordReceipt(value),
      insertIfAbsent: async () => {
        throw new Error('simulated persistence failure');
      },
      loadForUpdate: (id, problem) => repository.loadForUpdate(id, problem),
      save: (value) => repository.save(value),
    };
    const failingUseCase = new ApplyAcceptedSubmissionUseCase(failingRepository, runner);

    await expect(failingUseCase.execute(event)).rejects.toThrow('simulated persistence failure');
    const receipts: Array<{ event_id: string }> = await dataSource.query(
      'SELECT event_id FROM progress_event_receipts WHERE event_id = $1',
      [event.eventId],
    );
    expect(receipts).toHaveLength(0);
    expect(await useCase.execute(event)).toBe('APPLIED');
  });

  it('applies mixed-case UUIDs to existing progress and deduplicates an event across casing', async () => {
    const mixedProblemId = randomUUID();
    const first = {
      eventId: randomUUID(),
      submissionId: randomUUID(),
      userId,
      problemId: mixedProblemId,
      occurredAt: '2026-03-02T00:00:00.000Z',
      score: 40,
    };
    expect(await useCase.execute(first)).toBe('APPLIED');
    const second = {
      ...first,
      eventId: randomUUID(),
      submissionId: randomUUID(),
      occurredAt: '2026-03-01T00:00:00.000Z',
      score: 90,
    };
    const uppercase = {
      ...second,
      eventId: second.eventId.toUpperCase(),
      submissionId: second.submissionId.toUpperCase(),
      userId: userId.toUpperCase(),
      problemId: mixedProblemId.toUpperCase(),
    };
    expect(await useCase.execute(uppercase)).toBe('APPLIED');
    expect(await useCase.execute(second)).toBe('DUPLICATE');
    const rows: Array<{ best_score: number; solved_at: Date }> = await dataSource.query(
      'SELECT best_score, solved_at FROM progress WHERE user_id = $1 AND problem_id = $2',
      [userId, mixedProblemId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ best_score: 90, solved_at: new Date(second.occurredAt) });
  });

  it('upgrades a historical ATTEMPTED row when an accepted event arrives', async () => {
    const historicalProblemId = randomUUID();
    await dataSource.query(
      `INSERT INTO progress (user_id, problem_id, status, best_score)
       VALUES ($1, $2, 'ATTEMPTED', 0)`,
      [userId, historicalProblemId],
    );
    const event = {
      eventId: randomUUID(),
      submissionId: randomUUID(),
      userId,
      problemId: historicalProblemId,
      occurredAt: '2026-02-01T00:00:00.000Z',
      score: 75,
    };

    expect(await useCase.execute(event)).toBe('APPLIED');
    const rows: Array<{ status: string; best_score: number; solved_at: Date }> =
      await dataSource.query(
        'SELECT status, best_score, solved_at FROM progress WHERE user_id = $1 AND problem_id = $2',
        [userId, historicalProblemId],
      );
    expect(rows[0]).toMatchObject({
      status: 'SOLVED',
      best_score: 75,
      solved_at: new Date(event.occurredAt),
    });
  });
});
