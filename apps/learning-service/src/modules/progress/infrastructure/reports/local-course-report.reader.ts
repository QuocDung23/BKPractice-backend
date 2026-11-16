import { Injectable } from '@nestjs/common';

import type {
  LocalCourseReportReader,
  ManagedCourseStructure,
} from '@/modules/progress/application/reports/student-course-report.ports';
import { ProgressTransactionContext } from '@/modules/progress/infrastructure/persistence';

interface CourseRow {
  courseId: string;
  createdBy: string;
  chapterId: string | null;
  itemType: 'PROBLEM' | 'QUIZ' | null;
  itemId: string | null;
}
interface SolvedRow {
  userId: string;
  problemId: string;
  solvedAt: Date;
}
interface CompletedQuizRow {
  userId: string;
  quizId: string;
  completedAt: Date;
}

@Injectable()
export class LocalCourseReportReaderAdapter implements LocalCourseReportReader {
  constructor(private readonly context: ProgressTransactionContext) {}

  async loadCourse(courseId: string): Promise<ManagedCourseStructure | null> {
    const rows = await this.context.getManager().query<CourseRow[]>(
      `SELECT c.id AS "courseId", c.created_by AS "createdBy", ch.id AS "chapterId",
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
         JOIN quizzes q ON q.id = cq.quiz_id AND q.status = 'PUBLISHED' AND q.deleted_at IS NULL
         WHERE cq.chapter_id = ch.id
       ) content ON TRUE
       WHERE c.id = $1::uuid AND c.deleted_at IS NULL
       ORDER BY ch.display_order, ch.id, content.item_type, content.display_order, content.item_id`,
      [courseId],
    );
    if (!rows.length) return null;
    const chapters = new Map<
      string,
      { chapterId: string; items: Array<{ type: 'PROBLEM' | 'QUIZ'; itemId: string }> }
    >();
    for (const row of rows) {
      if (!row.chapterId) continue;
      let chapter = chapters.get(row.chapterId);
      if (!chapter) {
        chapter = { chapterId: row.chapterId, items: [] };
        chapters.set(row.chapterId, chapter);
      }
      if (row.itemType && row.itemId)
        chapter.items.push({ type: row.itemType, itemId: row.itemId });
    }
    const history = await this.context
      .getManager()
      .query<Array<{ problemId: string }>>(
        'SELECT problem_id AS "problemId" FROM course_problem_history WHERE course_id = $1::uuid ORDER BY problem_id',
        [courseId],
      );
    return {
      courseId: rows[0]!.courseId,
      createdBy: rows[0]!.createdBy,
      chapters: [...chapters.values()],
      submissionProblemIds: history.map((row) => row.problemId),
    };
  }

  async loadSolved(
    userIds: readonly string[],
    problemIds: readonly string[],
  ): Promise<ReadonlyMap<string, ReadonlyMap<string, Date>>> {
    const result = new Map<string, Map<string, Date>>();
    if (!userIds.length || !problemIds.length) return result;
    const rows = await this.context.getManager().query<SolvedRow[]>(
      `SELECT user_id AS "userId", problem_id AS "problemId", solved_at AS "solvedAt"
       FROM progress WHERE user_id = ANY($1::uuid[]) AND problem_id = ANY($2::uuid[])
         AND status = 'SOLVED' AND solved_at IS NOT NULL`,
      [userIds, problemIds],
    );
    for (const row of rows) {
      const byProblem = result.get(row.userId) ?? new Map<string, Date>();
      byProblem.set(row.problemId, row.solvedAt);
      result.set(row.userId, byProblem);
    }
    return result;
  }

  async loadCompletedQuizzes(
    userIds: readonly string[],
    quizIds: readonly string[],
  ): Promise<ReadonlyMap<string, ReadonlyMap<string, Date>>> {
    const result = new Map<string, Map<string, Date>>();
    if (!userIds.length || !quizIds.length) return result;
    const rows = await this.context.getManager().query<CompletedQuizRow[]>(
      `SELECT user_id AS "userId", quiz_id AS "quizId", MIN(finished_at) AS "completedAt"
       FROM quiz_attempts
       WHERE user_id = ANY($1::uuid[]) AND quiz_id = ANY($2::uuid[])
         AND status = 'FINISHED' AND passed = TRUE
       GROUP BY user_id, quiz_id`,
      [userIds, quizIds],
    );
    for (const row of rows) {
      const byQuiz = result.get(row.userId) ?? new Map<string, Date>();
      byQuiz.set(row.quizId, new Date(row.completedAt));
      result.set(row.userId, byQuiz);
    }
    return result;
  }
}
