import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Lrn009QuestionBankVisibility1700000012000 implements MigrationInterface {
  name = 'Lrn009QuestionBankVisibility1700000012000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      'ALTER TABLE quiz_bank_questions ADD COLUMN is_private boolean NOT NULL DEFAULT false',
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('ALTER TABLE quiz_bank_questions DROP COLUMN is_private');
  }
}
