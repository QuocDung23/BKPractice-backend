import type { MigrationInterface, QueryRunner } from 'typeorm';

export class LimitOfficialSubmissionPerProblem1792515606000 implements MigrationInterface {
  name = 'LimitOfficialSubmissionPerProblem1792515606000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "submissions" ADD COLUMN "official_attempt" boolean NOT NULL DEFAULT false',
    );
    await queryRunner.query(`
      UPDATE "submissions" AS submission
      SET "official_attempt" = true
      FROM (
        SELECT DISTINCT ON ("user_id", "problem_id") "id"
        FROM "submissions"
        WHERE "kind" = 'SUBMIT' AND "problem_id" IS NOT NULL
        ORDER BY "user_id", "problem_id", "created_at", "id"
      ) AS original
      WHERE submission."id" = original."id"
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_submissions_official_attempt"
      ON "submissions" ("user_id", "problem_id")
      WHERE "official_attempt" AND "kind" = 'SUBMIT'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "UQ_submissions_official_attempt"');
    await queryRunner.query('ALTER TABLE "submissions" DROP COLUMN "official_attempt"');
  }
}
