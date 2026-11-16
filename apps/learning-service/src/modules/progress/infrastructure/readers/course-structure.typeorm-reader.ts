import { Injectable } from '@nestjs/common';

import type { CourseStructureReader } from '@/modules/progress/application/ports/out';
import type { VisibleCourseStructure } from '@/modules/progress/domain/services';
import { ProgressTransactionContext } from '@/modules/progress/infrastructure/persistence';

interface StructureRow {
  courseId: string;
  chapterId: string | null;
  itemType: 'PROBLEM' | 'QUIZ' | null;
  itemId: string | null;
}
@Injectable()
export class CourseStructureTypeOrmReader implements CourseStructureReader {
  constructor(private readonly context: ProgressTransactionContext) {}
  async loadVisibleStructure(courseId: string): Promise<VisibleCourseStructure | null> {
    const rows = await this.context.getManager().query<StructureRow[]>(
      `SELECT c.id AS "courseId", ch.id AS "chapterId",
              content.item_type AS "itemType", content.item_id AS "itemId"
       FROM courses c
       LEFT JOIN chapters ch ON ch.course_id = c.id
       LEFT JOIN LATERAL (
         SELECT 'PROBLEM'::text AS item_type, p.id AS item_id, cp.display_order
         FROM chapter_problems cp
         JOIN problems p ON p.id = cp.problem_id
           AND p.publish_status = 'PUBLISHED' AND p.deleted_at IS NULL
         WHERE cp.chapter_id = ch.id AND cp.course_id = c.id
         UNION ALL
         SELECT 'QUIZ'::text AS item_type, q.id AS item_id, cq.display_order
         FROM chapter_quizzes cq
         JOIN quizzes q ON q.id = cq.quiz_id
           AND q.status = 'PUBLISHED' AND q.deleted_at IS NULL
         WHERE cq.chapter_id = ch.id
       ) content ON TRUE
       WHERE c.id = $1::uuid AND c.status = 'PUBLISHED' AND c.deleted_at IS NULL
       ORDER BY ch.display_order, ch.id, content.item_type, content.display_order, content.item_id`,
      [courseId],
    );
    if (!rows.length) return null;
    const chapters = new Map<
      string,
      {
        chapterId: string;
        items: Array<{ type: 'PROBLEM' | 'QUIZ'; itemId: string }>;
      }
    >();
    for (const row of rows) {
      if (!row.chapterId) continue;
      let chapter = chapters.get(row.chapterId);
      if (!chapter) {
        chapter = { chapterId: row.chapterId, items: [] };
        chapters.set(row.chapterId, chapter);
      }
      if (row.itemId && row.itemType) {
        chapter.items.push({ type: row.itemType, itemId: row.itemId });
      }
    }
    return { courseId: rows[0]!.courseId, chapters: [...chapters.values()] };
  }
}
