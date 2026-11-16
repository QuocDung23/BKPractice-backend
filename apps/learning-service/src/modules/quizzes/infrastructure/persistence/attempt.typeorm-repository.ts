import { Injectable } from '@nestjs/common';
import { In } from 'typeorm';

import { QuizAttemptRepository } from '@/modules/quizzes/application/ports/out';
import type { AttemptState, Page, PageQuery, QuestionRevision } from '@/modules/quizzes/domain';
import { QuizAttempt } from '@/modules/quizzes/domain';
import { QuizTransactionContext } from '@/modules/quizzes/infrastructure/persistence/quiz-transaction.context';
import {
  BankQuestionRevisionEntity,
  QuizAnswerEntity,
  QuizAttemptEntity,
  QuizItemEntity,
} from '@/modules/quizzes/infrastructure/persistence/quiz.entities';
@Injectable()
export class AttemptTypeOrmRepository extends QuizAttemptRepository {
  constructor(private readonly context: QuizTransactionContext) {
    super();
  }
  async lockStart(userId: string, quizId: string): Promise<void> {
    await this.context.lock('quiz-start:' + userId + ':' + quizId);
  }
  async find(id: string, userId: string, lock = false): Promise<QuizAttempt | null> {
    const m = this.context.getManager();
    const row = await m.getRepository(QuizAttemptEntity).findOne({
      where: { id, userId },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!row) return null;
    const questions = await m
      .getRepository(BankQuestionRevisionEntity)
      .createQueryBuilder('r')
      .innerJoin('quiz_revision_questions', 'i', 'i.question_revision_id=r.id')
      .where('i.quiz_revision_id=:revision', { revision: row.quizRevisionId })
      .orderBy('i.display_order', 'ASC')
      .getMany();
    const answers = await m.getRepository(QuizAnswerEntity).findBy({ attemptId: id });
    return new QuizAttempt(row as AttemptState, questions as QuestionRevision[], answers);
  }
  async active(userId: string, quizId: string): Promise<QuizAttempt | null> {
    const row = await this.context
      .getManager()
      .getRepository(QuizAttemptEntity)
      .findOneBy({ userId, quizId, status: 'IN_PROGRESS' });
    return row ? this.find(row.id, userId, true) : null;
  }
  async save(attempt: QuizAttempt): Promise<void> {
    const m = this.context.getManager();
    await m.getRepository(QuizAttemptEntity).save(attempt.state);
    if (attempt.answers.length)
      await m
        .getRepository(QuizAnswerEntity)
        .createQueryBuilder()
        .insert()
        .values(attempt.answers)
        .orIgnore()
        .execute();
  }
  async list(userId: string, q: PageQuery): Promise<Page<QuizAttempt>> {
    const qb = this.context
      .getManager()
      .getRepository(QuizAttemptEntity)
      .createQueryBuilder('a')
      .where('a.user_id=:userId', { userId });
    if (q.quizId) qb.andWhere('a.quiz_id=:quizId', { quizId: q.quizId });
    const total = await qb.getCount();
    const rows = await qb
      .orderBy('a.startedAt', 'DESC')
      .addOrderBy('a.id', 'ASC')
      .skip((q.page - 1) * q.limit)
      .take(q.limit)
      .getMany();
    const m = this.context.getManager();
    const revisionIds = [...new Set(rows.map((r) => r.quizRevisionId))];
    const links = revisionIds.length
      ? await m
          .getRepository(QuizItemEntity)
          .find({ where: { quizRevisionId: In(revisionIds) }, order: { displayOrder: 'ASC' } })
      : [];
    const questionIds = [...new Set(links.map((i) => i.questionRevisionId))];
    const questions = questionIds.length
      ? await m.getRepository(BankQuestionRevisionEntity).findBy({ id: In(questionIds) })
      : [];
    const answers = rows.length
      ? await m.getRepository(QuizAnswerEntity).findBy({ attemptId: In(rows.map((r) => r.id)) })
      : [];
    const items = rows.map(
      (r) =>
        new QuizAttempt(
          r as AttemptState,
          links
            .filter((i) => i.quizRevisionId === r.quizRevisionId)
            .map((i) => questions.find((q) => q.id === i.questionRevisionId)! as QuestionRevision),
          answers.filter((a) => a.attemptId === r.id),
        ),
    );
    return { items, total, page: q.page, limit: q.limit };
  }
  async completed(
    userId: string,
    quizId: string,
  ): Promise<{ completed: boolean; bestPercentage: number; passedRevisionId: string | null }> {
    const rows = await this.context
      .getManager()
      .query<{ best: string | null; passedRevisionId: string | null }[]>(
        `SELECT max(correct_count::numeric*100/total_questions)::text AS best,(array_agg(quiz_revision_id ORDER BY finished_at ASC) FILTER (WHERE passed))[1] AS "passedRevisionId" FROM quiz_attempts WHERE user_id=$1 AND quiz_id=$2 AND status='FINISHED'`,
        [userId, quizId],
      );
    return {
      completed: !!rows[0]?.passedRevisionId,
      bestPercentage: Number(rows[0]?.best ?? 0),
      passedRevisionId: rows[0]?.passedRevisionId ?? null,
    };
  }
}
