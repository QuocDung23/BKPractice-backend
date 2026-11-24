import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Post } from './post.entity';

@Entity('comments')
export class Comment {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @ManyToOne(() => Post, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post!: Post;
  @Index()
  @Column({ name: 'author_id', type: 'uuid' })
  authorId!: string;
  @ManyToOne(() => Comment, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'parent_comment_id' })
  parentComment!: Comment | null;
  @Column({ type: 'text' }) content!: string;
  @Column({ name: 'is_hidden', type: 'boolean', default: false }) isHidden!: boolean;
  @Column({ name: 'edited_at', type: 'timestamptz', nullable: true }) editedAt!: Date | null;
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true }) deletedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
