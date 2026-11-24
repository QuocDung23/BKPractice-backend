import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum ProgressStatus {
  Attempted = 'ATTEMPTED',
  Solved = 'SOLVED',
}

@Index(['userId', 'problemId'], { unique: true })
@Entity('progress')
export class Progress {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ name: 'problem_id', type: 'uuid' }) problemId!: string;
  @Column({ type: 'enum', enum: ProgressStatus }) status!: ProgressStatus;
  @Column({ name: 'best_score', type: 'integer', default: 0 }) bestScore!: number;
  @Column({ name: 'awarded_xp', type: 'integer', nullable: true }) awardedXp!: number | null;
  @Column({ name: 'solved_at', type: 'timestamptz', nullable: true }) solvedAt!: Date | null;
  @Column({ name: 'last_event_id', type: 'uuid', nullable: true }) lastEventId!: string | null;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
