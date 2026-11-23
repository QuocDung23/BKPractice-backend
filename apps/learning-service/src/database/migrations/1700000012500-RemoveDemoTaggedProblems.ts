import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveDemoTaggedProblems1700000012500 implements MigrationInterface {
  name = 'RemoveDemoTaggedProblems1700000012500';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $cleanup$
      DECLARE
        demo_marker CONSTANT text := '(^|[^[:alnum:]])demo[0-9]*([^[:alnum:]]|$)';
        demo_problem_ids uuid[];
      BEGIN
        LOCK TABLE courses, chapters, problems, quizzes, chapter_problems,
          chapter_quizzes, course_problem_history IN SHARE ROW EXCLUSIVE MODE;

        SELECT ARRAY(
          SELECT id FROM problems
          WHERE title ~* demo_marker OR slug ~* demo_marker
        ) INTO demo_problem_ids;

        IF cardinality(demo_problem_ids) = 0 THEN
          RETURN;
        END IF;

        UPDATE courses AS course
        SET status = 'ON_HOLD', updated_at = CURRENT_TIMESTAMP
        WHERE course.status = 'PUBLISHED' AND course.deleted_at IS NULL
          AND EXISTS (
            SELECT 1 FROM chapter_problems AS link
            JOIN problems AS problem ON problem.id = link.problem_id
            WHERE link.course_id = course.id AND problem.id = ANY(demo_problem_ids)
              AND problem.publish_status = 'PUBLISHED' AND problem.deleted_at IS NULL
          )
          AND NOT EXISTS (
            SELECT 1 FROM chapter_problems AS link
            JOIN problems AS problem ON problem.id = link.problem_id
            WHERE link.course_id = course.id AND problem.id <> ALL(demo_problem_ids)
              AND problem.publish_status = 'PUBLISHED' AND problem.deleted_at IS NULL
          )
          AND NOT EXISTS (
            SELECT 1 FROM chapters AS chapter
            JOIN chapter_quizzes AS link ON link.chapter_id = chapter.id
            JOIN quizzes AS quiz ON quiz.id = link.quiz_id
            WHERE chapter.course_id = course.id AND quiz.status = 'PUBLISHED'
              AND quiz.deleted_at IS NULL AND quiz.published_revision_id IS NOT NULL
          );

        DELETE FROM chapter_problems WHERE problem_id = ANY(demo_problem_ids);
        DELETE FROM course_problem_history WHERE problem_id = ANY(demo_problem_ids);
        DELETE FROM problems WHERE id = ANY(demo_problem_ids);
      END;
      $cleanup$;
    `);
  }

  down(): Promise<void> {
    return Promise.reject(new Error('Restore demo problems from a pre-migration backup.'));
  }
}
