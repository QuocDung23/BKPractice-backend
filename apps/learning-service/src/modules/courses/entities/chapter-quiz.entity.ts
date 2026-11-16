import { Column, Entity, PrimaryColumn } from 'typeorm';
@Entity('chapter_quizzes')
export class ChapterQuizEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column({ name: 'chapter_id', type: 'uuid' }) chapterId!: string;
  @Column({ name: 'quiz_id', type: 'uuid' }) quizId!: string;
  @Column({ name: 'display_order', type: 'integer' }) displayOrder!: number;
}
