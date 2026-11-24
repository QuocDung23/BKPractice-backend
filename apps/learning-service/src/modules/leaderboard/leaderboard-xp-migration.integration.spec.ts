import { AddLeaderboardXp1700000015000 } from '@learning/database/migrations/1700000015000-AddLeaderboardXp';
import { DataSource } from 'typeorm';

import {
  assertTestDatabase,
  learningDataSourceOptions,
  TEST_DATABASE_URL,
} from '@/modules/courses/testing';

assertTestDatabase();
const describeIntegration = TEST_DATABASE_URL ? describe : describe.skip;

describeIntegration('Leaderboard XP migration (temporary PostgreSQL tables)', () => {
  it('backfills existing solves once by difficulty and preserves the original solve times', async () => {
    const database = await new DataSource(learningDataSourceOptions()).initialize();
    const runner = database.createQueryRunner();
    try {
      await runner.startTransaction();
      await runner.query(`
        CREATE TEMP TABLE problems (id integer PRIMARY KEY, difficulty text) ON COMMIT DROP;
        CREATE TEMP TABLE progress (
          problem_id integer, status text, solved_at timestamptz
        ) ON COMMIT DROP;
        INSERT INTO problems VALUES (1, 'EASY'), (2, 'MEDIUM'), (3, 'HARD'), (4, 'HARD');
        INSERT INTO progress VALUES
          (1, 'SOLVED', '2026-11-23T00:00:00Z'),
          (2, 'SOLVED', '2026-11-24T00:00:00Z'),
          (3, 'SOLVED', '2026-11-25T00:00:00Z'),
          (4, 'ATTEMPTED', NULL),
          (5, 'SOLVED', '2026-11-26T00:00:00Z');
      `);
      const migration = new AddLeaderboardXp1700000015000();
      await migration.up(runner);
      expect(
        await runner.query(
          'SELECT problem_id, awarded_xp, solved_at FROM progress ORDER BY problem_id',
        ),
      ).toEqual([
        { problem_id: 1, awarded_xp: 10, solved_at: new Date('2026-11-23T00:00:00Z') },
        { problem_id: 2, awarded_xp: 20, solved_at: new Date('2026-11-24T00:00:00Z') },
        { problem_id: 3, awarded_xp: 30, solved_at: new Date('2026-11-25T00:00:00Z') },
        { problem_id: 4, awarded_xp: null, solved_at: null },
        { problem_id: 5, awarded_xp: null, solved_at: new Date('2026-11-26T00:00:00Z') },
      ]);
      await migration.down(runner);
      expect(await runner.query('SELECT COUNT(*)::integer AS total FROM progress')).toEqual([
        { total: 5 },
      ]);
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
      await database.destroy();
    }
  });
});
