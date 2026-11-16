import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Lrn009CourseProblemHistory1700000011000 implements MigrationInterface {
  name = 'Lrn009CourseProblemHistory1700000011000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE course_problem_history (
      course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      problem_id uuid NOT NULL REFERENCES problems(id) ON DELETE RESTRICT,
      PRIMARY KEY (course_id, problem_id)
    )`);
    await queryRunner.query(`INSERT INTO course_problem_history (course_id, problem_id)
      SELECT DISTINCT course_id, problem_id FROM chapter_problems ON CONFLICT DO NOTHING`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE course_problem_history');
  }
}
