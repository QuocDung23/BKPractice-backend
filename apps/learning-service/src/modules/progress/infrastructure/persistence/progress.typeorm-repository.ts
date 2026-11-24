import { Injectable } from '@nestjs/common';

import type { AcceptedSubmission } from '@/modules/progress/domain';
import { ProblemProgress } from '@/modules/progress/domain';
import type { ProgressRepository, SolvedProblemPage } from '@/modules/progress/domain/repositories';
import { Progress, ProgressStatus } from '@/modules/progress/entities';
import { ProgressTransactionContext } from '@/modules/progress/infrastructure/persistence/progress-transaction-context';

function xpForProblem(problemIdParameter: string): string {
  return `(SELECT CASE problem.difficulty
             WHEN 'EASY' THEN 10 WHEN 'MEDIUM' THEN 20 WHEN 'HARD' THEN 30
           END FROM problems problem WHERE problem.id = ${problemIdParameter})`;
}

@Injectable()
export class ProgressTypeOrmRepository implements ProgressRepository {
  constructor(private readonly context: ProgressTransactionContext) {}

  async findSolved(
    userId: string,
    problemIds: readonly string[],
  ): Promise<ReadonlyMap<string, Date>> {
    if (!problemIds.length) return new Map();
    const rows = await this.context
      .getManager()
      .getRepository(Progress)
      .createQueryBuilder('progress')
      .select('progress.problemId', 'problemId')
      .addSelect('progress.solvedAt', 'solvedAt')
      .where('progress.userId = :userId', { userId })
      .andWhere('progress.problemId IN (:...problemIds)', { problemIds: [...problemIds] })
      .andWhere('progress.status = :status', { status: ProgressStatus.Solved })
      .andWhere('progress.solvedAt IS NOT NULL')
      .getRawMany<{ problemId: string; solvedAt: Date }>();
    return new Map(rows.map((row) => [row.problemId, row.solvedAt]));
  }

  async listSolved(userId: string, page: number, limit: number): Promise<SolvedProblemPage> {
    const query = this.context
      .getManager()
      .getRepository(Progress)
      .createQueryBuilder('progress')
      .innerJoin(
        'problems',
        'problem',
        "problem.id = progress.problemId AND problem.publish_status = 'PUBLISHED' AND problem.deleted_at IS NULL",
      )
      .where('progress.userId = :userId', { userId })
      .andWhere('progress.status = :status', { status: ProgressStatus.Solved })
      .andWhere('progress.solvedAt IS NOT NULL');
    const total = await query.getCount();
    const items = await query
      .select('progress.problemId', 'problemId')
      .addSelect('progress.solvedAt', 'solvedAt')
      .orderBy('progress.solvedAt', 'DESC')
      .addOrderBy('progress.problemId', 'ASC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany<{ problemId: string; solvedAt: Date }>();
    return { items, total, page, limit };
  }

  async recordReceipt(event: AcceptedSubmission): Promise<boolean> {
    const rows: unknown = await this.context.requireManager().query(
      `INSERT INTO progress_event_receipts (event_id, user_id, problem_id)
       VALUES ($1, $2, $3) ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
      [event.eventId, event.userId, event.problemId],
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  async insertIfAbsent(progress: ProblemProgress): Promise<boolean> {
    const rows: unknown = await this.context.requireManager().query(
      `INSERT INTO progress (user_id, problem_id, status, best_score, solved_at, last_event_id, awarded_xp)
       VALUES ($1, $2, 'SOLVED', $3, $4, $5, ${xpForProblem('$2')})
       ON CONFLICT (user_id, problem_id) DO NOTHING RETURNING id`,
      [
        progress.userId,
        progress.problemId,
        progress.bestScore,
        progress.solvedAt,
        progress.lastEventId,
      ],
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  async loadForUpdate(userId: string, problemId: string): Promise<ProblemProgress | null> {
    const entity = await this.context
      .requireManager()
      .getRepository(Progress)
      .createQueryBuilder('progress')
      .where('progress.userId = :userId AND progress.problemId = :problemId', {
        userId,
        problemId,
      })
      .setLock('pessimistic_write')
      .getOne();
    if (!entity) return null;
    if (entity.status === ProgressStatus.Attempted) return null;
    if (entity.solvedAt === null) throw new Error('Solved progress has no solvedAt');
    return ProblemProgress.rehydrate({
      userId: entity.userId,
      problemId: entity.problemId,
      bestScore: entity.bestScore,
      solvedAt: entity.solvedAt,
      lastEventId: entity.lastEventId ?? '',
    });
  }

  async save(progress: ProblemProgress): Promise<void> {
    const result = await this.context
      .requireManager()
      .createQueryBuilder()
      .update(Progress)
      .set({
        status: ProgressStatus.Solved,
        bestScore: progress.bestScore,
        solvedAt: progress.solvedAt,
        lastEventId: progress.lastEventId,
        awardedXp: () => `COALESCE(awarded_xp, ${xpForProblem(':problemId')})`,
      })
      .where({ userId: progress.userId, problemId: progress.problemId })
      .setParameter('problemId', progress.problemId)
      .execute();
    if (result.affected !== 1) throw new Error('Progress disappeared during accepted submission');
  }
}
