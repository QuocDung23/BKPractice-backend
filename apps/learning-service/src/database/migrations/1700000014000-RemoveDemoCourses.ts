import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveDemoCourses1700000014000 implements MigrationInterface {
  name = 'RemoveDemoCourses1700000014000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $cleanup$
      DECLARE
        demo_marker CONSTANT text := '(^|[^[:alnum:]])demo[0-9]*([^[:alnum:]]|$)';
        demo_course_ids uuid[];
        demo_quiz_ids uuid[];
      BEGIN
        LOCK TABLE courses, chapters, chapter_problems, chapter_quizzes, quizzes,
          quiz_revisions, quiz_revision_questions, quiz_grants, quiz_attempts,
          quiz_attempt_answers, course_problem_history IN SHARE ROW EXCLUSIVE MODE;

        SELECT ARRAY(
          SELECT id FROM courses WHERE title ~* demo_marker OR slug ~* demo_marker
        ) INTO demo_course_ids;

        IF cardinality(demo_course_ids) = 0 THEN
          RETURN;
        END IF;

        -- Quizzes attached only to demo courses are demo content too.
        SELECT ARRAY(
          SELECT link.quiz_id
          FROM chapter_quizzes AS link
          JOIN chapters AS chapter ON chapter.id = link.chapter_id
          GROUP BY link.quiz_id
          HAVING bool_and(chapter.course_id = ANY(demo_course_ids))
            AND EXISTS (
              SELECT 1 FROM chapter_quizzes AS l2
              JOIN chapters AS c2 ON c2.id = l2.chapter_id
              WHERE l2.quiz_id = link.quiz_id AND c2.course_id = ANY(demo_course_ids)
            )
        ) INTO demo_quiz_ids;

        -- Cascades to chapters, chapter_problems, chapter_quizzes, course_problem_history.
        DELETE FROM courses WHERE id = ANY(demo_course_ids);

        IF cardinality(demo_quiz_ids) > 0 THEN
          UPDATE quizzes SET published_revision_id = NULL WHERE id = ANY(demo_quiz_ids);
          DELETE FROM quiz_attempt_answers WHERE attempt_id IN (
            SELECT id FROM quiz_attempts WHERE quiz_id = ANY(demo_quiz_ids));
          DELETE FROM quiz_attempts WHERE quiz_id = ANY(demo_quiz_ids);
          DELETE FROM quiz_revision_questions WHERE quiz_revision_id IN (
            SELECT id FROM quiz_revisions WHERE quiz_id = ANY(demo_quiz_ids));
          DELETE FROM quiz_grants WHERE quiz_id = ANY(demo_quiz_ids);
          DELETE FROM chapter_quizzes WHERE quiz_id = ANY(demo_quiz_ids);
          DELETE FROM quiz_revisions WHERE quiz_id = ANY(demo_quiz_ids);
          DELETE FROM quizzes WHERE id = ANY(demo_quiz_ids);
        END IF;
      END;
      $cleanup$;
    `);
  }

  down(): Promise<void> {
    return Promise.reject(new Error('Restore demo courses from a pre-migration backup.'));
  }
}
