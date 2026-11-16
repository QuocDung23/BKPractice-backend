import { Column, Entity, PrimaryColumn } from 'typeorm';

import type { QuestionOption } from '@/modules/quizzes/domain';
@Entity('quiz_bank_questions')
export class BankQuestionEntity {
  @PrimaryColumn({ name: 'id', type: 'uuid' }) id!: string;
  @Column({ name: 'created_by', type: 'uuid' }) createdBy!: string;
  @Column({ name: 'current_revision_id', type: 'uuid' }) currentRevisionId!: string;
  @Column({ name: 'is_private', type: 'boolean', default: false }) isPrivate!: boolean;
  @Column({ name: 'client_request_id', type: 'uuid' }) clientRequestId!: string;
  @Column({ name: 'request_hash', type: 'text' }) requestHash!: string;
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true }) deletedAt!: Date | null;
  @Column({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @Column({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
@Entity('quiz_bank_question_revisions')
export class BankQuestionRevisionEntity {
  @PrimaryColumn({ name: 'id', type: 'uuid' }) id!: string;
  @Column({ name: 'question_id', type: 'uuid' }) questionId!: string;
  @Column({ name: 'revision', type: 'integer' }) revision!: number;
  @Column({ name: 'content', type: 'text' }) content!: string;
  @Column({ name: 'explanation', type: 'text' }) explanation!: string;
  @Column({ name: 'options', type: 'jsonb' }) options!: QuestionOption[];
  @Column({ name: 'difficulty', type: 'text' }) difficulty!: string;
  @Column({ name: 'topic_ids', type: 'uuid', array: true }) topicIds!: string[];
  @Column({ name: 'tag_ids', type: 'uuid', array: true }) tagIds!: string[];
  @Column({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
@Entity('quizzes')
export class QuizEntity {
  @PrimaryColumn({ name: 'id', type: 'uuid' }) id!: string;
  @Column({ name: 'created_by', type: 'uuid' }) createdBy!: string;
  @Column({ name: 'status', type: 'text' }) status!: string;
  @Column({ name: 'published_revision_id', type: 'uuid', nullable: true }) publishedRevisionId!:
    string | null;
  @Column({ name: 'client_request_id', type: 'uuid' }) clientRequestId!: string;
  @Column({ name: 'request_hash', type: 'text' }) requestHash!: string;
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true }) deletedAt!: Date | null;
  @Column({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @Column({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
@Entity('quiz_revisions')
export class QuizRevisionEntity {
  @PrimaryColumn({ name: 'id', type: 'uuid' }) id!: string;
  @Column({ name: 'quiz_id', type: 'uuid' }) quizId!: string;
  @Column({ name: 'revision', type: 'integer' }) revision!: number;
  @Column({ name: 'title', type: 'text' }) title!: string;
  @Column({ name: 'description', type: 'text', nullable: true }) description!: string | null;
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true }) publishedAt!: Date | null;
  @Column({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
@Entity('quiz_revision_questions')
export class QuizItemEntity {
  @PrimaryColumn({ name: 'id', type: 'uuid' }) id!: string;
  @Column({ name: 'quiz_revision_id', type: 'uuid' }) quizRevisionId!: string;
  @Column({ name: 'question_id', type: 'uuid' }) questionId!: string;
  @Column({ name: 'question_revision_id', type: 'uuid' }) questionRevisionId!: string;
  @Column({ name: 'display_order', type: 'integer' }) displayOrder!: number;
}
@Entity('quiz_question_grants')
export class QuestionGrantEntity {
  @PrimaryColumn({ name: 'question_id', type: 'uuid' }) questionId!: string;
  @PrimaryColumn({ name: 'user_id', type: 'uuid' }) userId!: string;
}
@Entity('quiz_grants')
export class QuizGrantEntity {
  @PrimaryColumn({ name: 'quiz_id', type: 'uuid' }) quizId!: string;
  @PrimaryColumn({ name: 'user_id', type: 'uuid' }) userId!: string;
}
@Entity('quiz_attempts')
export class QuizAttemptEntity {
  @PrimaryColumn({ name: 'id', type: 'uuid' }) id!: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ name: 'quiz_id', type: 'uuid' }) quizId!: string;
  @Column({ name: 'quiz_revision_id', type: 'uuid' }) quizRevisionId!: string;
  @Column({ name: 'status', type: 'text' }) status!: string;
  @Column({ name: 'total_questions', type: 'integer' }) totalQuestions!: number;
  @Column({ name: 'correct_count', type: 'integer', nullable: true }) correctCount!: number | null;
  @Column({ name: 'passed', type: 'boolean', nullable: true }) passed!: boolean | null;
  @Column({ name: 'started_at', type: 'timestamptz' }) startedAt!: Date;
  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true }) finishedAt!: Date | null;
}
@Entity('quiz_attempt_answers')
export class QuizAnswerEntity {
  @PrimaryColumn({ name: 'attempt_id', type: 'uuid' }) attemptId!: string;
  @PrimaryColumn({ name: 'question_id', type: 'uuid' }) questionId!: string;
  @Column({ name: 'question_revision_id', type: 'uuid' }) questionRevisionId!: string;
  @Column({ name: 'selected_option_id', type: 'uuid' }) selectedOptionId!: string;
  @Column({ name: 'is_correct', type: 'boolean' }) isCorrect!: boolean;
  @Column({ name: 'answered_at', type: 'timestamptz' }) answeredAt!: Date;
}
