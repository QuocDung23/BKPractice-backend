import { Injectable } from '@nestjs/common';

import {
  BankTaxonomyReader,
  QuizCourseAccessReader,
  QuizReferenceReader,
} from '@/modules/quizzes/application/ports/out';
import { QuizError } from '@/modules/quizzes/domain';
import { QuizTransactionContext } from '@/modules/quizzes/infrastructure/persistence/quiz-transaction.context';
@Injectable()
export class QuizCourseTypeOrmReader extends QuizCourseAccessReader {
  constructor(private readonly context: QuizTransactionContext) {
    super();
  }
  async isVisible(id: string): Promise<boolean> {
    const rows = await this.context
      .getManager()
      .query<{ id: string }[]>(
        `SELECT q.id FROM quizzes q WHERE q.id=$1 AND q.status='PUBLISHED' AND q.deleted_at IS NULL AND EXISTS(SELECT 1 FROM chapter_quizzes cq JOIN chapters ch ON ch.id=cq.chapter_id JOIN courses c ON c.id=ch.course_id WHERE cq.quiz_id=q.id AND c.status='PUBLISHED' AND c.deleted_at IS NULL)`,
        [id],
      );
    return !!rows.length;
  }
}
@Injectable()
export class BankTaxonomyTypeOrmReader extends BankTaxonomyReader {
  constructor(private readonly context: QuizTransactionContext) {
    super();
  }
  async validate(topics: string[], tags: string[]): Promise<void> {
    for (const [table, ids] of [
      ['topics', topics],
      ['tags', tags],
    ] as const) {
      if (!ids.length) continue;
      const rows = await this.context
        .getManager()
        .query<{ id: string }[]>(`SELECT id FROM ${table} WHERE id=ANY($1::uuid[])`, [ids]);
      if (rows.length !== ids.length) throw new QuizError('INVALID', 'Unknown topic or tag');
    }
  }
}
@Injectable()
export class QuizReferenceTypeOrmReader extends QuizReferenceReader {
  constructor(private readonly context: QuizTransactionContext) {
    super();
  }
  async read(ids: string[]): Promise<
    Map<
      string,
      {
        id: string;
        title: string;
        status: string;
        deletedAt: Date | null;
        createdBy: string;
        sharedWith: string[];
      }
    >
  > {
    if (!ids.length) return new Map();
    const rows = await this.context.getManager().query<
      {
        id: string;
        title: string;
        status: string;
        deletedAt: Date | null;
        createdBy: string;
        sharedWith: string[];
      }[]
    >(`SELECT q.id,r.title,q.status,q.deleted_at AS "deletedAt",q.created_by AS "createdBy",ARRAY(SELECT user_id::text FROM quiz_grants WHERE quiz_id=q.id) AS "sharedWith" FROM quizzes q LEFT JOIN quiz_revisions r ON r.id=q.published_revision_id WHERE q.id=ANY($1::uuid[])`, [ids]);
    return new Map(rows.map((r) => [r.id, r]));
  }
}
