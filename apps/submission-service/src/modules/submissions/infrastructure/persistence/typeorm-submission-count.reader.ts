import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import type {
  SubmissionCount,
  SubmissionCountReader,
} from '../../application/count-course-submissions.use-case';

@Injectable()
export class TypeormSubmissionCountReader implements SubmissionCountReader {
  constructor(private readonly database: DataSource) {}

  async count(
    userIds: readonly string[],
    problemIds: readonly string[],
  ): Promise<SubmissionCount[]> {
    if (!userIds.length || !problemIds.length) return [];
    const rows = await this.database.query<
      Array<{ userId: string; problemId: string; count: number }>
    >(
      `SELECT user_id AS "userId", problem_id AS "problemId", count(*)::int AS count
       FROM submissions WHERE kind = 'SUBMIT' AND user_id = ANY($1::uuid[])
         AND problem_id = ANY($2::uuid[])
       GROUP BY user_id, problem_id`,
      [userIds, problemIds],
    );
    return rows.map((row) => ({ userId: row.userId, problemId: row.problemId, count: row.count }));
  }
}
