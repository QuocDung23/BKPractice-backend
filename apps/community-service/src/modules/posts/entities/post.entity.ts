import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum PostScope {
  Global = 'GLOBAL',
  Problem = 'PROBLEM',
  Course = 'COURSE',
}

@Entity('posts')
export class Post {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Index()
  @Column({ name: 'author_id', type: 'uuid' })
  authorId!: string;
  @Column({ type: 'enum', enum: PostScope }) scope!: PostScope;
  @Column({ type: 'text' }) content!: string;
  @Index()
  @Column({ name: 'problem_id', type: 'uuid', nullable: true })
  problemId!: string | null;
  @Index()
  @Column({ name: 'course_id', type: 'uuid', nullable: true })
  courseId!: string | null;
  @Column({ name: 'is_pinned', type: 'boolean', default: false }) isPinned!: boolean;
  @Column({ name: 'is_hidden', type: 'boolean', default: false }) isHidden!: boolean;
  @Column({ name: 'edited_at', type: 'timestamptz', nullable: true }) editedAt!: Date | null;
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true }) deletedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
