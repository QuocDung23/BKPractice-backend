import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveDemoProblems1700000013000 implements MigrationInterface {
  name = 'RemoveDemoProblems1700000013000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $cleanup$
      DECLARE
        demo_course_slug CONSTANT text := 'demo-course-1794753018834';
        demo_problem_ids uuid[];
        blocked_course_slugs text;
        hold_demo_course boolean;
      BEGIN
        LOCK TABLE courses, chapters, problems, quizzes, chapter_problems,
          chapter_quizzes, course_problem_history IN SHARE ROW EXCLUSIVE MODE;

        SELECT ARRAY(
          SELECT id FROM problems
          WHERE regexp_replace(title, '^[[:space:]]+', '') ILIKE '[DEMO]%'
        ) INTO demo_problem_ids;

        IF cardinality(demo_problem_ids) = 0 THEN
          RETURN;
        END IF;

        SELECT string_agg(course.slug, ', ' ORDER BY course.slug)
                 FILTER (WHERE course.slug <> demo_course_slug),
               bool_or(course.slug = demo_course_slug)
        INTO blocked_course_slugs, hold_demo_course
        FROM courses AS course
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

        IF blocked_course_slugs IS NOT NULL THEN
          RAISE EXCEPTION 'Removing [DEMO] problems would leave published courses without a learning item: %',
            blocked_course_slugs;
        END IF;

        IF hold_demo_course THEN
          UPDATE courses
          SET status = 'ON_HOLD', updated_at = CURRENT_TIMESTAMP
          WHERE slug = demo_course_slug;
        END IF;

        DELETE FROM chapter_problems WHERE problem_id = ANY(demo_problem_ids);
        DELETE FROM course_problem_history WHERE problem_id = ANY(demo_problem_ids);
        DELETE FROM problems WHERE id = ANY(demo_problem_ids);
      END;
      $cleanup$;
    `);
  }

  down(): Promise<void> {
    return Promise.reject(
      new Error('Restore deleted [DEMO] problems from a pre-migration backup.'),
    );
  }
}
