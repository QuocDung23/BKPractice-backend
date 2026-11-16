import { Injectable } from '@nestjs/common';
import { In } from 'typeorm';

import { QuestionRepository } from '@/modules/quizzes/application/ports/out';
import type { Page, PageQuery, Principal, QuestionRevision } from '@/modules/quizzes/domain';
import { Question } from '@/modules/quizzes/domain';
import { QuizTransactionContext } from '@/modules/quizzes/infrastructure/persistence/quiz-transaction.context';
import {
  BankQuestionEntity,
  BankQuestionRevisionEntity,
  QuestionGrantEntity,
} from '@/modules/quizzes/infrastructure/persistence/quiz.entities';
@Injectable()
export class QuestionTypeOrmRepository extends QuestionRepository {
  constructor(private readonly context: QuizTransactionContext) {
    super();
  }
  async lockRequest(owner: string, requestId: string): Promise<void> {
    await this.context.lock('question-create:' + owner + ':' + requestId);
  }
  async find(id: string, lock = false): Promise<Question | null> {
    const manager = this.context.getManager();
    const root = await manager.getRepository(BankQuestionEntity).findOne({
      where: { id },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!root) return null;
    const rev = await manager
      .getRepository(BankQuestionRevisionEntity)
      .findOneByOrFail({ id: root.currentRevisionId });
    const grants = await manager.getRepository(QuestionGrantEntity).findBy({ questionId: id });
    return new Question(
      root,
      rev as QuestionRevision,
      grants.map((g) => g.userId),
    );
  }
  async findMany(ids: string[]): Promise<Question[]> {
    if (!ids.length) return [];
    const m = this.context.getManager();
    const roots = await m.getRepository(BankQuestionEntity).findBy({ id: In(ids) });
    const revisions = await this.revisions(roots.map((r) => r.currentRevisionId));
    const grants = await m.getRepository(QuestionGrantEntity).findBy({ questionId: In(ids) });
    return roots.map(
      (r) =>
        new Question(
          r,
          revisions.find((v) => v.id === r.currentRevisionId)!,
          grants.filter((g) => g.questionId === r.id).map((g) => g.userId),
        ),
    );
  }
  async findRequest(createdBy: string, clientRequestId: string): Promise<Question | null> {
    const row = await this.context
      .getManager()
      .getRepository(BankQuestionEntity)
      .findOneBy({ createdBy, clientRequestId });
    return row ? this.find(row.id) : null;
  }
  async save(q: Question): Promise<void> {
    const m = this.context.getManager();
    await m.getRepository(BankQuestionEntity).save(q.state);
    await m
      .getRepository(BankQuestionRevisionEntity)
      .createQueryBuilder()
      .insert()
      .values(q.revision)
      .orIgnore()
      .execute();
  }
  async revisions(ids: string[]): Promise<QuestionRevision[]> {
    if (!ids.length) return [];
    return (await this.context
      .getManager()
      .getRepository(BankQuestionRevisionEntity)
      .findBy({ id: In(ids) })) as QuestionRevision[];
  }
  async list(p: Principal, query: PageQuery): Promise<Page<Question>> {
    const m = this.context.getManager();
    const qb = m
      .getRepository(BankQuestionEntity)
      .createQueryBuilder('q')
      .innerJoin(BankQuestionRevisionEntity, 'r', 'r.id=q.current_revision_id')
      .where('q.deleted_at IS NULL');
    if (!p.roles.includes('ADMIN'))
      qb.andWhere(
        '(q.created_by=:uid OR q.is_private=false OR EXISTS(SELECT 1 FROM quiz_question_grants g WHERE g.question_id=q.id AND g.user_id=:uid))',
        { uid: p.userId },
      );
    if (query.q)
      qb.andWhere('r.content ILIKE :search', {
        search: '%' + query.q.replace(/[\\%_]/g, '\\$&') + '%',
      });
    if (query.difficulty) qb.andWhere('r.difficulty=:difficulty', { difficulty: query.difficulty });
    if (query.topicId) qb.andWhere(':topic=ANY(r.topic_ids)', { topic: query.topicId });
    if (query.tagId) qb.andWhere(':tag=ANY(r.tag_ids)', { tag: query.tagId });
    const total = await qb.getCount();
    const rows = await qb
      .orderBy('q.createdAt', 'DESC')
      .addOrderBy('q.id', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getMany();
    const revisions = await this.revisions(rows.map((r) => r.currentRevisionId));
    const grants = rows.length
      ? await m.getRepository(QuestionGrantEntity).findBy({ questionId: In(rows.map((r) => r.id)) })
      : [];
    return {
      items: rows.map(
        (r) =>
          new Question(
            r,
            revisions.find((v) => v.id === r.currentRevisionId)!,
            grants.filter((g) => g.questionId === r.id).map((g) => g.userId),
          ),
      ),
      total,
      page: query.page,
      limit: query.limit,
    };
  }
  async share(questionId: string, userId: string, enabled: boolean): Promise<void> {
    const repo = this.context.getManager().getRepository(QuestionGrantEntity);
    if (enabled) await repo.upsert({ questionId, userId }, ['questionId', 'userId']);
    else await repo.delete({ questionId, userId });
  }
  async usage(id: string, p: Principal): Promise<{ id: string; title: string }[]> {
    return this.context
      .getManager()
      .query<{ id: string; title: string }[]>(
        `SELECT DISTINCT q.id,r.title FROM quizzes q JOIN quiz_revisions r ON r.quiz_id=q.id JOIN quiz_revision_questions i ON i.quiz_revision_id=r.id WHERE i.question_id=$1 AND (q.created_by=$2 OR $3 OR (q.status='PUBLISHED' AND q.deleted_at IS NULL AND r.id=q.published_revision_id AND EXISTS(SELECT 1 FROM quiz_grants g WHERE g.quiz_id=q.id AND g.user_id=$2))) ORDER BY q.id`,
        [id, p.userId, p.roles.includes('ADMIN')],
      );
  }
}
