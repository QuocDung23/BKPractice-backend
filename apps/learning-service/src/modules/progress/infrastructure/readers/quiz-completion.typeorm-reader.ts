import { Injectable } from '@nestjs/common';

import type { QuizCompletionReader } from '@/modules/progress/application/ports/out';
import { ProgressTransactionContext } from '@/modules/progress/infrastructure/persistence';

interface CompletedQuizRow {
  readonly quizId: string;
  readonly completedAt: Date;
}

@Injectable()
export class QuizCompletionTypeOrmReader implements QuizCompletionReader {
  constructor(private readonly context: ProgressTransactionContext) {}

  async findCompleted(
    userId: string,
    quizIds: readonly string[],
  ): Promise<ReadonlyMap<string, Date>> {
    if (quizIds.length === 0) return new Map();
    const rows = await this.context.getManager().query<CompletedQuizRow[]>(
      `SELECT quiz_id AS "quizId", MIN(finished_at) AS "completedAt"
       FROM quiz_attempts
       WHERE user_id = $1::uuid
         AND quiz_id = ANY($2::uuid[])
         AND status = 'FINISHED'
         AND passed = TRUE
       GROUP BY quiz_id`,
      [userId, [...quizIds]],
    );
    return new Map(rows.map((row) => [row.quizId, new Date(row.completedAt)]));
  }
}
