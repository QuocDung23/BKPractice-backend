import type { CompilerError, SupportedLanguage } from '@app/contracts';
import {
  SubmissionKind,
  SubmissionStatus,
} from '@submission/modules/submissions/domain/submission-record';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';

@Entity('submissions')
@Index('UQ_submissions_official_attempt', ['userId', 'problemId'], {
  unique: true,
  where: `"official_attempt" AND "kind" = 'SUBMIT'`,
})
export class Submission {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({
    name: 'public_id',
    type: 'uuid',
    unique: true,
    default: () => 'gen_random_uuid()',
  })
  publicId!: string;
  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;
  @Index()
  @Column({ name: 'problem_id', type: 'uuid', nullable: true })
  problemId!: string | null;
  @Column({ type: 'enum', enum: SubmissionKind }) kind!: SubmissionKind;
  @Column({ name: 'official_attempt', type: 'boolean', default: false })
  officialAttempt!: boolean;
  @Column({ type: 'varchar', length: 20 }) language!: SupportedLanguage;
  @Column({ name: 'source_code', type: 'text' }) sourceCode!: string;
  @Column({ type: 'text', nullable: true }) stdin!: string | null;
  @Column({ type: 'enum', enum: SubmissionStatus, default: SubmissionStatus.Pending })
  status!: SubmissionStatus;
  @Column({ type: 'integer', nullable: true }) score!: number | null;
  @Column({ name: 'passed_tests', type: 'integer', nullable: true }) passedTests!: number | null;
  @Column({ name: 'total_tests', type: 'integer', nullable: true }) totalTests!: number | null;
  @Column({ name: 'runtime_ms', type: 'integer', nullable: true }) runtimeMs!: number | null;
  @Column({ name: 'memory_kb', type: 'integer', nullable: true }) memoryKb!: number | null;
  @Column({ name: 'accepted_event_id', type: 'uuid', nullable: true })
  acceptedEventId!: string | null;
  @Column({ name: 'progress_event_published_at', type: 'timestamptz', nullable: true })
  progressEventPublishedAt!: Date | null;
  @OneToOne(() => SubmissionResult, (result) => result.submission)
  result?: Relation<SubmissionResult>;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

@Entity('submission_results')
export class SubmissionResult {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @OneToOne(() => Submission, (submission) => submission.result, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'submission_id' })
  submission!: Relation<Submission>;
  @Column({ type: 'text', nullable: true }) stdout!: string | null;
  @Column({ type: 'text', nullable: true }) stderr!: string | null;
  @Column({ name: 'compile_output', type: 'text', nullable: true }) compileOutput!: string | null;
  @Column({ type: 'jsonb', nullable: true }) error!: CompilerError | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
