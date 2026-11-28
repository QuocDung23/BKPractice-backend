import type { MigrationInterface, QueryRunner } from 'typeorm';

export class QuizDifficultyAndXpAwards1700000016000 implements MigrationInterface {
  name = 'QuizDifficultyAndXpAwards1700000016000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE quiz_revisions ADD COLUMN difficulty text NOT NULL DEFAULT 'EASY'",
    );
    await queryRunner.query(
      "ALTER TABLE quiz_revisions ADD CONSTRAINT quiz_revision_difficulty CHECK (difficulty IN ('EASY','MEDIUM','HARD'))",
    );
    await queryRunner.query('ALTER TABLE quiz_attempts ADD COLUMN awarded_xp integer');
    await queryRunner.query(
      'ALTER TABLE quiz_attempts ADD CONSTRAINT quiz_attempt_awarded_xp CHECK (awarded_xp IS NULL OR awarded_xp IN (10,20,30))',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX quiz_one_xp_award ON quiz_attempts(user_id,quiz_id) WHERE awarded_xp > 0',
    );
    await queryRunner.query(
      'CREATE INDEX quiz_attempt_leaderboard_awards ON quiz_attempts(finished_at) WHERE awarded_xp > 0',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX quiz_attempt_leaderboard_awards');
    await queryRunner.query('DROP INDEX quiz_one_xp_award');
    await queryRunner.query('ALTER TABLE quiz_attempts DROP CONSTRAINT quiz_attempt_awarded_xp');
    await queryRunner.query('ALTER TABLE quiz_attempts DROP COLUMN awarded_xp');
    await queryRunner.query('ALTER TABLE quiz_revisions DROP CONSTRAINT quiz_revision_difficulty');
    await queryRunner.query('ALTER TABLE quiz_revisions DROP COLUMN difficulty');
  }
}
