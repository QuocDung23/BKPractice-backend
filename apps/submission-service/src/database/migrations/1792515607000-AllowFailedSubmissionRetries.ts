import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowFailedSubmissionRetries1792515607000 implements MigrationInterface {
  name = 'AllowFailedSubmissionRetries1792515607000';

  up(queryRunner: QueryRunner): Promise<void> {
    return this.rebuildOfficialAttempts(queryRunner, true);
  }

  down(queryRunner: QueryRunner): Promise<void> {
    return this.rebuildOfficialAttempts(queryRunner, false);
  }

  private async rebuildOfficialAttempts(
    queryRunner: QueryRunner,
    allowRetries: boolean,
  ): Promise<void> {
    await queryRunner.query('LOCK TABLE "submissions" IN SHARE ROW EXCLUSIVE MODE');
    await queryRunner.query(
      'UPDATE "submissions" SET "official_attempt" = false WHERE "official_attempt"',
    );
    const verdictFilter = allowRetries
      ? `AND "status" IN ('PENDING', 'QUEUED', 'RUNNING', 'ACCEPTED')`
      : '';
    const priority = allowRetries
      ? `("status" = 'ACCEPTED') DESC, "created_at" DESC`
      : '"created_at"';
    await queryRunner.query(`
      UPDATE "submissions" AS submission
      SET "official_attempt" = true
      FROM (
        SELECT DISTINCT ON ("user_id", "problem_id") "id"
        FROM "submissions"
        WHERE "kind" = 'SUBMIT' AND "problem_id" IS NOT NULL ${verdictFilter}
        ORDER BY "user_id", "problem_id", ${priority}, "id"
      ) AS selected
      WHERE submission."id" = selected."id"
    `);
  }
}
