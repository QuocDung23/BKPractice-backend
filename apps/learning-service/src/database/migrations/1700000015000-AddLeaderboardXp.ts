import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLeaderboardXp1700000015000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE progress ADD COLUMN awarded_xp integer');
    await queryRunner.query(`
      UPDATE progress AS progress
      SET awarded_xp = CASE problem.difficulty
        WHEN 'EASY' THEN 10 WHEN 'MEDIUM' THEN 20 WHEN 'HARD' THEN 30
      END
      FROM problems AS problem
      WHERE progress.problem_id = problem.id
        AND progress.status = 'SOLVED'
        AND progress.solved_at IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX idx_progress_leaderboard_solved_at ON progress (solved_at)
      WHERE status = 'SOLVED' AND awarded_xp IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX idx_progress_leaderboard_solved_at');
    await queryRunner.query('ALTER TABLE progress DROP COLUMN awarded_xp');
  }
}
