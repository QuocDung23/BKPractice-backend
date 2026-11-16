import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { In, IsNull } from 'typeorm';

import { QuizRepository } from '@/modules/quizzes/application/ports/out';
import type { Page, PageQuery, Principal, QuizRevision } from '@/modules/quizzes/domain';
import { Quiz } from '@/modules/quizzes/domain';
import { QuizTransactionContext } from '@/modules/quizzes/infrastructure/persistence/quiz-transaction.context';
import {
  QuizEntity,
  QuizGrantEntity,
  QuizItemEntity,
  QuizRevisionEntity,
} from '@/modules/quizzes/infrastructure/persistence/quiz.entities';

@Injectable()
export class QuizTypeOrmRepository extends QuizRepository {
  constructor(private readonly context: QuizTransactionContext) {
    super();
  }
  async revision(id: string): Promise<QuizRevision | null> {
    const m = this.context.getManager();
    const rev = await m.getRepository(QuizRevisionEntity).findOneBy({ id });
    if (!rev) return null;
    const rows = await m
      .getRepository(QuizItemEntity)
      .find({ where: { quizRevisionId: id }, order: { displayOrder: 'ASC' } });
    return {
      ...rev,
      items: rows.map((i) => ({
        questionId: i.questionId,
        questionRevisionId: i.questionRevisionId,
      })),
    };
  }
  async lockRequest(owner: string, requestId: string): Promise<void> {
    await this.context.lock('quiz-create:' + owner + ':' + requestId);
  }
  async find(id: string, lock = false): Promise<Quiz | null> {
    const m = this.context.getManager();
    const root = await m.getRepository(QuizEntity).findOne({
      where: { id },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!root) return null;
    const draft = await m
      .getRepository(QuizRevisionEntity)
      .findOneBy({ quizId: id, publishedAt: IsNull() });
    const shares = await m.getRepository(QuizGrantEntity).findBy({ quizId: id });
    return new Quiz(
      { ...root, status: root.status as 'DRAFT' | 'PUBLISHED' | 'ON_HOLD' },
      draft ? await this.revision(draft.id) : null,
      root.publishedRevisionId ? await this.revision(root.publishedRevisionId) : null,
      shares.map((g) => g.userId),
    );
  }
  async findRequest(createdBy: string, clientRequestId: string): Promise<Quiz | null> {
    const row = await this.context
      .getManager()
      .getRepository(QuizEntity)
      .findOneBy({ createdBy, clientRequestId });
    return row ? this.find(row.id) : null;
  }
  async save(q: Quiz): Promise<void> {
    const m = this.context.getManager();
    await m.getRepository(QuizEntity).save(q.state);
    const revision = q.draft ?? q.published;
    if (!revision) return;
    const existing = await m.getRepository(QuizRevisionEntity).findOneBy({ id: revision.id });
    if (existing?.publishedAt) return;
    const { items, ...row } = revision;
    await m.getRepository(QuizRevisionEntity).save(row);
    await m.getRepository(QuizItemEntity).delete({ quizRevisionId: row.id });
    if (items.length)
      await m.getRepository(QuizItemEntity).insert(
        items.map((i, displayOrder) => ({
          ...i,
          id: randomUUID(),
          quizRevisionId: row.id,
          displayOrder,
        })),
      );
  }
  async list(p: Principal, query: PageQuery): Promise<Page<Quiz>> {
    const qb = this.context
      .getManager()
      .getRepository(QuizEntity)
      .createQueryBuilder('q')
      .where('q.deleted_at IS NULL');
    if (!p.roles.includes('ADMIN'))
      qb.andWhere(
        "(q.created_by=:uid OR (q.status='PUBLISHED' AND EXISTS(SELECT 1 FROM quiz_grants g WHERE g.quiz_id=q.id AND g.user_id=:uid)))",
        { uid: p.userId },
      );
    if (query.q)
      qb.andWhere(
        `EXISTS(SELECT 1 FROM quiz_revisions r WHERE r.quiz_id=q.id AND (r.id=q.published_revision_id OR (r.published_at IS NULL AND (q.created_by=:uid OR :admin))) AND r.title ILIKE :search)`,
        {
          uid: p.userId,
          admin: p.roles.includes('ADMIN'),
          search: '%' + query.q.replace(/[\\%_]/g, '\\$&') + '%',
        },
      );
    const total = await qb.getCount();
    const rows = await qb
      .orderBy('q.createdAt', 'DESC')
      .addOrderBy('q.id', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getMany();
    const ids = rows.map((r) => r.id);
    const m = this.context.getManager();
    const revisions = ids.length
      ? await m.getRepository(QuizRevisionEntity).find({
          where: [
            { quizId: In(ids), publishedAt: IsNull() },
            {
              id: In(rows.flatMap((r) => (r.publishedRevisionId ? [r.publishedRevisionId] : []))),
            },
          ],
        })
      : [];
    const revisionIds = revisions.map((r) => r.id);
    const links = revisionIds.length
      ? await m
          .getRepository(QuizItemEntity)
          .find({ where: { quizRevisionId: In(revisionIds) }, order: { displayOrder: 'ASC' } })
      : [];
    const grants = ids.length
      ? await m.getRepository(QuizGrantEntity).findBy({ quizId: In(ids) })
      : [];
    const definitions = revisions.map((r): QuizRevision => ({
      ...r,
      items: links
        .filter((i) => i.quizRevisionId === r.id)
        .map((i) => ({ questionId: i.questionId, questionRevisionId: i.questionRevisionId })),
    }));
    const items = rows.map(
      (r) =>
        new Quiz(
          { ...r, status: r.status as 'DRAFT' | 'PUBLISHED' | 'ON_HOLD' },
          definitions.find((v) => v.quizId === r.id && !v.publishedAt) ?? null,
          definitions.find((v) => v.id === r.publishedRevisionId) ?? null,
          grants.filter((g) => g.quizId === r.id).map((g) => g.userId),
        ),
    );
    return { items, total, page: query.page, limit: query.limit };
  }
  async share(quizId: string, userId: string, enabled: boolean): Promise<void> {
    const r = this.context.getManager().getRepository(QuizGrantEntity);
    if (enabled) await r.upsert({ quizId, userId }, ['quizId', 'userId']);
    else await r.delete({ quizId, userId });
  }
}
