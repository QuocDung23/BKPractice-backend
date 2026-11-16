import type { MigrationInterface, QueryRunner } from 'typeorm';
export class Lrn009QuizQuestionBank1700000011000 implements MigrationInterface {
  name = 'Lrn009QuizQuestionBank1700000011000';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      'CREATE TABLE "quiz_bank_questions" ("id" uuid NOT NULL, "created_by" uuid NOT NULL, "current_revision_id" uuid NOT NULL, "client_request_id" uuid NOT NULL, "request_hash" text NOT NULL, "deleted_at" timestamptz, "created_at" timestamptz NOT NULL, "updated_at" timestamptz NOT NULL, PRIMARY KEY ("id"))',
    );
    await runner.query(
      'CREATE TABLE "quiz_bank_question_revisions" ("id" uuid NOT NULL, "question_id" uuid NOT NULL, "revision" integer NOT NULL, "content" text NOT NULL, "explanation" text NOT NULL, "options" jsonb NOT NULL, "difficulty" text NOT NULL, "topic_ids" uuid[] NOT NULL, "tag_ids" uuid[] NOT NULL, "created_at" timestamptz NOT NULL, PRIMARY KEY ("id"))',
    );
    await runner.query(
      'CREATE TABLE "quizzes" ("id" uuid NOT NULL, "created_by" uuid NOT NULL, "status" text NOT NULL, "published_revision_id" uuid, "client_request_id" uuid NOT NULL, "request_hash" text NOT NULL, "deleted_at" timestamptz, "created_at" timestamptz NOT NULL, "updated_at" timestamptz NOT NULL, PRIMARY KEY ("id"))',
    );
    await runner.query(
      'CREATE TABLE "quiz_revisions" ("id" uuid NOT NULL, "quiz_id" uuid NOT NULL, "revision" integer NOT NULL, "title" text NOT NULL, "description" text, "published_at" timestamptz, "created_at" timestamptz NOT NULL, PRIMARY KEY ("id"))',
    );
    await runner.query(
      'CREATE TABLE "quiz_revision_questions" ("id" uuid NOT NULL, "quiz_revision_id" uuid NOT NULL, "question_id" uuid NOT NULL, "question_revision_id" uuid NOT NULL, "display_order" integer NOT NULL, PRIMARY KEY ("id"))',
    );
    await runner.query(
      'CREATE TABLE "quiz_question_grants" ("question_id" uuid NOT NULL, "user_id" uuid NOT NULL, PRIMARY KEY ("question_id","user_id"))',
    );
    await runner.query(
      'CREATE TABLE "quiz_grants" ("quiz_id" uuid NOT NULL, "user_id" uuid NOT NULL, PRIMARY KEY ("quiz_id","user_id"))',
    );
    await runner.query(
      'CREATE TABLE "quiz_attempts" ("id" uuid NOT NULL, "user_id" uuid NOT NULL, "quiz_id" uuid NOT NULL, "quiz_revision_id" uuid NOT NULL, "status" text NOT NULL, "total_questions" integer NOT NULL, "correct_count" integer, "passed" boolean, "started_at" timestamptz NOT NULL, "finished_at" timestamptz, PRIMARY KEY ("id"))',
    );
    await runner.query(
      'CREATE TABLE "quiz_attempt_answers" ("attempt_id" uuid NOT NULL, "question_id" uuid NOT NULL, "question_revision_id" uuid NOT NULL, "selected_option_id" uuid NOT NULL, "is_correct" boolean NOT NULL, "answered_at" timestamptz NOT NULL, PRIMARY KEY ("attempt_id","question_id"))',
    );
    await runner.query('ALTER TABLE quiz_bank_questions ADD UNIQUE (created_by,client_request_id)');
    await runner.query('ALTER TABLE quizzes ADD UNIQUE (created_by,client_request_id)');
    await runner.query(
      "ALTER TABLE quiz_bank_question_revisions ADD UNIQUE(question_id,revision), ADD UNIQUE(id,question_id), ADD FOREIGN KEY(question_id) REFERENCES quiz_bank_questions(id), ADD CHECK(jsonb_typeof(options)='array' AND jsonb_array_length(options) BETWEEN 2 AND 6), ADD CHECK(difficulty IN ('EASY','MEDIUM','HARD'))",
    );
    await runner.query(
      'ALTER TABLE quiz_bank_questions ADD FOREIGN KEY(current_revision_id,id) REFERENCES quiz_bank_question_revisions(id,question_id) DEFERRABLE INITIALLY DEFERRED',
    );
    await runner.query(
      'ALTER TABLE quiz_revisions ADD UNIQUE(quiz_id,revision), ADD UNIQUE(id,quiz_id), ADD FOREIGN KEY(quiz_id) REFERENCES quizzes(id)',
    );
    await runner.query(
      "ALTER TABLE quizzes ADD FOREIGN KEY(published_revision_id,id) REFERENCES quiz_revisions(id,quiz_id) DEFERRABLE INITIALLY DEFERRED, ADD CHECK(status IN ('DRAFT','PUBLISHED','ON_HOLD'))",
    );
    await runner.query(
      'CREATE UNIQUE INDEX quiz_one_draft ON quiz_revisions(quiz_id) WHERE published_at IS NULL',
    );
    await runner.query(
      'ALTER TABLE quiz_revision_questions ADD FOREIGN KEY(quiz_revision_id) REFERENCES quiz_revisions(id), ADD FOREIGN KEY(question_revision_id,question_id) REFERENCES quiz_bank_question_revisions(id,question_id), ADD UNIQUE(quiz_revision_id,question_id), ADD CONSTRAINT quiz_question_order UNIQUE(quiz_revision_id,display_order) DEFERRABLE INITIALLY DEFERRED, ADD CHECK(display_order>=0)',
    );
    await runner.query(
      'ALTER TABLE quiz_question_grants ADD FOREIGN KEY(question_id) REFERENCES quiz_bank_questions(id)',
    );
    await runner.query('ALTER TABLE quiz_grants ADD FOREIGN KEY(quiz_id) REFERENCES quizzes(id)');
    await runner.query(
      'CREATE TABLE chapter_quizzes(id uuid PRIMARY KEY, chapter_id uuid NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,quiz_id uuid NOT NULL REFERENCES quizzes(id),display_order integer NOT NULL CHECK(display_order>=0),UNIQUE(chapter_id,quiz_id),CONSTRAINT chapter_quiz_order UNIQUE(chapter_id,display_order) DEFERRABLE INITIALLY DEFERRED)',
    );
    await runner.query('CREATE INDEX chapter_quizzes_quiz ON chapter_quizzes(quiz_id)');
    await runner.query(
      "ALTER TABLE quiz_attempts ADD FOREIGN KEY(quiz_revision_id,quiz_id) REFERENCES quiz_revisions(id,quiz_id), ADD CHECK(total_questions BETWEEN 1 AND 50), ADD CHECK(status IN ('IN_PROGRESS','FINISHED')), ADD CHECK((status='IN_PROGRESS' AND correct_count IS NULL AND passed IS NULL AND finished_at IS NULL) OR (status='FINISHED' AND correct_count BETWEEN 0 AND total_questions AND passed IS NOT NULL AND passed=(correct_count*100>=total_questions*90) AND finished_at IS NOT NULL))",
    );
    await runner.query(
      "CREATE UNIQUE INDEX quiz_one_active_attempt ON quiz_attempts(user_id,quiz_id) WHERE status='IN_PROGRESS'",
    );
    await runner.query(
      'CREATE INDEX quiz_attempt_history ON quiz_attempts(user_id,quiz_id,started_at DESC,id)',
    );
    await runner.query(
      'ALTER TABLE quiz_attempt_answers ADD FOREIGN KEY(attempt_id) REFERENCES quiz_attempts(id), ADD FOREIGN KEY(question_revision_id,question_id) REFERENCES quiz_bank_question_revisions(id,question_id)',
    );
    await runner.query(
      'CREATE INDEX quiz_bank_owner ON quiz_bank_questions(created_by,created_at DESC)',
    );
    await runner.query(
      'CREATE INDEX quiz_question_grants_recipient ON quiz_question_grants(user_id,question_id)',
    );
    await runner.query('CREATE INDEX quiz_grants_recipient ON quiz_grants(user_id,quiz_id)');
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE IF EXISTS quiz_attempt_answers CASCADE');
    await runner.query('DROP TABLE IF EXISTS quiz_attempts CASCADE');
    await runner.query('DROP TABLE IF EXISTS chapter_quizzes CASCADE');
    await runner.query('DROP TABLE IF EXISTS quiz_grants CASCADE');
    await runner.query('DROP TABLE IF EXISTS quiz_question_grants CASCADE');
    await runner.query('DROP TABLE IF EXISTS quiz_revision_questions CASCADE');
    await runner.query('DROP TABLE IF EXISTS quiz_revisions CASCADE');
    await runner.query('DROP TABLE IF EXISTS quizzes CASCADE');
    await runner.query('DROP TABLE IF EXISTS quiz_bank_question_revisions CASCADE');
    await runner.query('DROP TABLE IF EXISTS quiz_bank_questions CASCADE');
  }
}
