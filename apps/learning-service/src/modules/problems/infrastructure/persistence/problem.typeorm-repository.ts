import { randomUUID } from 'node:crypto';

import type { SupportedLanguage } from '@app/contracts';
import { ConcurrentModificationError } from '@learning/modules/problems/application/errors/concurrent-modification.error';
import { DuplicateSlugError } from '@learning/modules/problems/domain/errors/duplicate-slug.error';
import type { Problem } from '@learning/modules/problems/domain/problem.aggregate';
import type {
  ManagedProblemListFilter,
  ProblemListFilter,
  ProblemPage,
  ProblemRepository,
} from '@learning/modules/problems/domain/repositories/problem.repository.port.out';
import { TestSuiteSummary } from '@learning/modules/problems/domain/value-objects';
import {
  PublishStatus as EntityPublishStatus,
  Problem as ProblemEntity,
} from '@learning/modules/problems/entities/problem.entity';
import { Injectable } from '@nestjs/common';
import type { EntityManager, QueryDeepPartialEntity, SelectQueryBuilder } from 'typeorm';
import { QueryFailedError } from 'typeorm';

import { ProblemPersistenceMapper } from './problem.persistence-mapper';
import { TypeOrmTransactionContext } from './typeorm-transaction-context';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

@Injectable()
export class ProblemTypeOrmRepository implements ProblemRepository {
  constructor(
    private readonly transactionContext: TypeOrmTransactionContext,
    private readonly mapper: ProblemPersistenceMapper,
  ) {}

  async findById(id: string): Promise<Problem | null> {
    return this.baseQuery(this.transactionContext.getManager())
      .where('p.id = :id', { id })
      .andWhere('p.deletedAt IS NULL')
      .getOne()
      .then((entity) => (entity === null ? null : this.mapper.toDomain(entity)));
  }

  async findByIdIncludingDeleted(id: string): Promise<Problem | null> {
    return this.baseQuery(this.transactionContext.getManager())
      .where('p.id = :id', { id })
      .getOne()
      .then((entity) => (entity === null ? null : this.mapper.toDomain(entity)));
  }

  async findPublishedByIdOrSlug(idOrSlug: string): Promise<Problem | null> {
    const query = this.baseQuery(this.transactionContext.getManager())
      .where('p.publishStatus = :status', { status: EntityPublishStatus.Published })
      .andWhere('p.deletedAt IS NULL');

    if (UUID_PATTERN.test(idOrSlug)) {
      query.andWhere('p.id = :id', { id: idOrSlug });
    } else {
      query.andWhere('p.slug = :slug', { slug: idOrSlug });
    }

    const entity = await query.getOne();

    return entity === null ? null : this.mapper.toDomain(entity);
  }

  async findManagedById(id: string, includeDeleted: boolean): Promise<Problem | null> {
    const query = this.baseQuery(this.transactionContext.getManager()).where('p.id = :id', { id });

    if (!includeDeleted) {
      query.andWhere('p.deletedAt IS NULL');
    }

    const entity = await query.getOne();

    return entity === null ? null : this.mapper.toDomain(entity);
  }

  async loadForUpdate(id: string, includeDeleted = false): Promise<Problem | null> {
    const manager = this.transactionContext.requireManager();
    const lockQuery = manager
      .getRepository(ProblemEntity)
      .createQueryBuilder('p')
      .select('p.id', 'id')
      .where('p.id = :id', { id });

    if (!includeDeleted) {
      lockQuery.andWhere('p.deletedAt IS NULL');
    }

    const locked = await lockQuery.setLock('pessimistic_write').getRawOne<{ id: string }>();

    if (locked === undefined) {
      return null;
    }

    const entity = await this.baseQuery(manager).where('p.id = :id', { id }).getOne();

    return entity === null ? null : this.mapper.toDomain(entity);
  }

  async loadTestSuiteSummary(problemId: string): Promise<TestSuiteSummary> {
    const summaries = await this.loadTestSuiteSummaries([problemId]);

    return summaries.get(problemId) ?? TestSuiteSummary.empty();
  }

  async loadTestSuiteSummaries(
    problemIds: readonly string[],
  ): Promise<ReadonlyMap<string, TestSuiteSummary>> {
    const summaries = new Map(problemIds.map((problemId) => [problemId, TestSuiteSummary.empty()]));

    if (problemIds.length === 0) {
      return summaries;
    }

    const manager = this.transactionContext.getManager();
    const testRows = await manager.query<
      Array<{
        problemId: string;
        totalCount: number;
        hiddenCount: number;
        totalScore: string | number;
        testCaseBytes: string | number;
      }>
    >(
      `SELECT
         "problem_id" AS "problemId",
         COUNT(*)::int AS "totalCount",
         COUNT(*) FILTER (WHERE "is_hidden")::int AS "hiddenCount",
         COALESCE(SUM("score"), 0)::bigint AS "totalScore",
         COALESCE(SUM(octet_length("input") + octet_length("expected_output")), 0)::bigint AS "testCaseBytes"
       FROM "test_cases"
       WHERE "problem_id" = ANY($1::uuid[])
       GROUP BY "problem_id"`,
      [problemIds],
    );
    const harnessRows = await manager.query<
      Array<{
        problemId: string;
        languages: string[] | null;
        harnessBytes: string | number;
      }>
    >(
      `SELECT
         "harness"."problem_id" AS "problemId",
         COALESCE(array_agg("harness"."language" ORDER BY "harness"."language"), ARRAY[]::varchar[]) AS "languages",
         COALESCE(SUM(octet_length("harness"."source")), 0)::bigint AS "harnessBytes"
       FROM "problem_harnesses" AS "harness"
       WHERE "harness"."problem_id" = ANY($1::uuid[])
         AND EXISTS (
           SELECT 1 FROM "problems" AS "problem"
           WHERE "problem"."id" = "harness"."problem_id" AND "problem"."problem_type" <> 'STANDARD'
         )
         AND EXISTS (
           SELECT 1 FROM "problem_languages" AS "language"
           WHERE "language"."problem_id" = "harness"."problem_id"
             AND "language"."language" = "harness"."language"
             AND "language"."enabled"
         )
       GROUP BY "harness"."problem_id"`,
      [problemIds],
    );

    const testsByProblem = new Map(testRows.map((row) => [row.problemId, row]));
    const harnessesByProblem = new Map(harnessRows.map((row) => [row.problemId, row]));

    for (const problemId of problemIds) {
      const tests = testsByProblem.get(problemId);
      const harnesses = harnessesByProblem.get(problemId);

      summaries.set(
        problemId,
        TestSuiteSummary.fromStored({
          totalCount: Number(tests?.totalCount ?? 0),
          hiddenCount: Number(tests?.hiddenCount ?? 0),
          totalScore: Number(tests?.totalScore ?? 0),
          totalBytes: Number(tests?.testCaseBytes ?? 0) + Number(harnesses?.harnessBytes ?? 0),
          harnessLanguages: (harnesses?.languages ?? []) as readonly SupportedLanguage[],
        }),
      );
    }

    return summaries;
  }

  async listPublished(filter: ProblemListFilter): Promise<ProblemPage<Problem>> {
    const manager = this.transactionContext.getManager();
    const countQuery = applyPublicFilters(
      manager.getRepository(ProblemEntity).createQueryBuilder('p'),
      filter,
    );
    const total = await countQuery.getCount();

    if (total === 0) {
      return { items: [], total, page: filter.page, limit: filter.limit };
    }

    const idQuery = applyPublicFilters(
      manager.getRepository(ProblemEntity).createQueryBuilder('p'),
      filter,
    )
      .select('p.id', 'id')
      .orderBy('p.createdAt', 'DESC')
      .addOrderBy('p.id', 'DESC')
      .offset((filter.page - 1) * filter.limit)
      .limit(filter.limit);
    const rows = await idQuery.getRawMany<{ id: string }>();
    const items = await this.loadByIds(
      manager,
      rows.map((row) => row.id),
    );

    return { items, total, page: filter.page, limit: filter.limit };
  }

  async listManaged(filter: ManagedProblemListFilter): Promise<ProblemPage<Problem>> {
    const manager = this.transactionContext.getManager();
    const countQuery = applyManagedFilters(
      manager.getRepository(ProblemEntity).createQueryBuilder('p'),
      filter,
    );
    const total = await countQuery.getCount();

    if (total === 0) {
      return { items: [], total, page: filter.page, limit: filter.limit };
    }

    const idQuery = applyManagedFilters(
      manager.getRepository(ProblemEntity).createQueryBuilder('p'),
      filter,
    )
      .select('p.id', 'id')
      .orderBy('p.updatedAt', 'DESC')
      .addOrderBy('p.id', 'DESC')
      .offset((filter.page - 1) * filter.limit)
      .limit(filter.limit);
    const rows = await idQuery.getRawMany<{ id: string }>();
    const items = await this.loadByIds(
      manager,
      rows.map((row) => row.id),
    );

    return { items, total, page: filter.page, limit: filter.limit };
  }

  async isSlugAvailable(slug: string, excludeProblemId?: string): Promise<boolean> {
    const query = this.transactionContext
      .getManager()
      .getRepository(ProblemEntity)
      .createQueryBuilder('p')
      .where('p.slug = :slug', { slug });

    if (excludeProblemId !== undefined) {
      query.andWhere('p.id <> :excludeProblemId', { excludeProblemId });
    }

    return !(await query.getExists());
  }

  async save(problem: Problem, expectedUpdatedAt?: Date): Promise<void> {
    const manager = this.transactionContext.requireManager();

    if (expectedUpdatedAt === undefined) {
      try {
        await manager.insert(
          ProblemEntity,
          this.mapper.toInsertValues(problem) as QueryDeepPartialEntity<ProblemEntity>,
        );
      } catch (error) {
        this.rethrowUniqueSlug(error, problem.slug.value);
      }
    } else {
      const values = {
        ...(this.mapper.toUpdateValues(problem) as QueryDeepPartialEntity<ProblemEntity>),
        updatedAt: () => "date_trunc('milliseconds', CAST(:updatedAt AS timestamptz))",
      } as QueryDeepPartialEntity<ProblemEntity>;
      const result = await manager
        .createQueryBuilder()
        .update(ProblemEntity)
        .set(values)
        .where('id = :id', { id: problem.id.value })
        .andWhere(
          "date_trunc('milliseconds', \"updated_at\") = date_trunc('milliseconds', CAST(:expectedUpdatedAt AS timestamptz))",
        )
        .setParameters({
          updatedAt: problem.updatedAt,
          expectedUpdatedAt,
        })
        .execute();

      if (result.affected !== 1) {
        throw new ConcurrentModificationError();
      }
    }

    await this.syncRelations(manager, problem);
  }

  async softDelete(id: string, at: Date): Promise<boolean> {
    const result = await this.transactionContext
      .requireManager()
      .createQueryBuilder()
      .update(ProblemEntity)
      .set({ deletedAt: at, updatedAt: at })
      .where('id = :id', { id })
      .andWhere('deletedAt IS NULL')
      .andWhere('publishStatus IN (:...statuses)', {
        statuses: [EntityPublishStatus.Published, EntityPublishStatus.OnHold],
      })
      .execute();

    return result.affected === 1;
  }

  async restore(id: string, at: Date): Promise<boolean> {
    const result = await this.transactionContext
      .requireManager()
      .createQueryBuilder()
      .update(ProblemEntity)
      .set({ deletedAt: null, updatedAt: at })
      .where('id = :id', { id })
      .andWhere('deletedAt IS NOT NULL')
      .execute();

    return result.affected === 1;
  }

  private baseQuery(manager: EntityManager): SelectQueryBuilder<ProblemEntity> {
    return manager
      .getRepository(ProblemEntity)
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.topics', 'topic')
      .leftJoinAndSelect('p.tags', 'tag')
      .leftJoinAndSelect('p.languages', 'language')
      .leftJoinAndSelect('p.starterCodes', 'starter');
  }

  private async loadByIds(
    manager: EntityManager,
    ids: readonly string[],
  ): Promise<readonly Problem[]> {
    if (ids.length === 0) {
      return [];
    }

    const entities = await this.baseQuery(manager).where('p.id IN (:...ids)', { ids }).getMany();
    const byId = new Map(entities.map((entity) => [entity.id, this.mapper.toDomain(entity)]));

    return ids
      .map((id) => byId.get(id))
      .filter((problem): problem is Problem => problem !== undefined);
  }

  private async syncRelations(manager: EntityManager, problem: Problem): Promise<void> {
    const problemId = problem.id.value;

    await manager.query('DELETE FROM "problem_topics" WHERE "problem_id" = $1', [problemId]);

    for (const topic of problem.topics) {
      await manager.query(
        'INSERT INTO "problem_topics" ("problem_id", "topic_id") VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [problemId, topic.value],
      );
    }

    await manager.query('DELETE FROM "problem_tags" WHERE "problem_id" = $1', [problemId]);

    for (const tag of problem.tags) {
      await manager.query(
        'INSERT INTO "problem_tags" ("problem_id", "tag_id") VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [problemId, tag.value],
      );
    }

    const languages = problem.enabledLanguages.map((language) => language.value);

    for (const language of languages) {
      await manager.query(
        `INSERT INTO "problem_languages" ("id", "problem_id", "language", "enabled")
         VALUES ($1, $2, $3, TRUE)
         ON CONFLICT ("problem_id", "language")
         DO UPDATE SET "enabled" = TRUE`,
        [randomUUID(), problemId, language],
      );
    }

    await manager.query(
      'UPDATE "problem_languages" SET "enabled" = FALSE WHERE "problem_id" = $1 AND "language" <> ALL($2::varchar[])',
      [problemId, languages],
    );

    const starterLanguages = problem.starterCodes.map((starterCode) => starterCode.language);

    for (const starterCode of problem.starterCodes) {
      await manager.query(
        `INSERT INTO "starter_codes" ("id", "problem_id", "language", "source_code")
         VALUES ($1, $2, $3, $4)
         ON CONFLICT ("problem_id", "language")
         DO UPDATE SET "source_code" = EXCLUDED."source_code"`,
        [randomUUID(), problemId, starterCode.language, starterCode.sourceCode],
      );
    }

    await manager.query(
      'DELETE FROM "starter_codes" WHERE "problem_id" = $1 AND "language" <> ALL($2::varchar[])',
      [problemId, starterLanguages],
    );
  }

  private rethrowUniqueSlug(error: unknown, slug: string): never {
    if (error instanceof QueryFailedError) {
      const driverError = error.driverError as {
        code?: string;
        constraint?: string;
        detail?: string;
        message?: string;
      };
      const text = [driverError.constraint, driverError.detail, driverError.message]
        .filter((value): value is string => typeof value === 'string')
        .join(' ')
        .toLowerCase();

      if (driverError.code === '23505' && text.includes('slug')) {
        throw new DuplicateSlugError(slug);
      }
    }

    throw error;
  }
}

function applyPublicFilters(
  query: SelectQueryBuilder<ProblemEntity>,
  filter: ProblemListFilter,
): SelectQueryBuilder<ProblemEntity> {
  query
    .where('p.publishStatus = :publishedStatus', {
      publishedStatus: EntityPublishStatus.Published,
    })
    .andWhere('p.deletedAt IS NULL');

  if (filter.problemType !== undefined) {
    query.andWhere('p.problemType = :problemType', {
      problemType: filter.problemType,
    });
  }

  if (filter.difficulty !== undefined) {
    query.andWhere('p.difficulty = :difficulty', {
      difficulty: filter.difficulty,
    });
  }

  const search = filter.search?.trim();

  if (search !== undefined && search.length > 0) {
    query.andWhere("(p.title ILIKE :search ESCAPE '\\' OR p.slug ILIKE :search ESCAPE '\\')", {
      search: `%${escapeLike(search)}%`,
    });
  }

  if (filter.topicId !== undefined) {
    query.andWhere(
      'EXISTS (SELECT 1 FROM "problem_topics" pt WHERE pt."problem_id" = p.id AND pt."topic_id" = :topicId)',
      { topicId: filter.topicId },
    );
  }

  if (filter.tagId !== undefined) {
    query.andWhere(
      'EXISTS (SELECT 1 FROM "problem_tags" pt WHERE pt."problem_id" = p.id AND pt."tag_id" = :tagId)',
      { tagId: filter.tagId },
    );
  }

  return query;
}

function applyManagedFilters(
  query: SelectQueryBuilder<ProblemEntity>,
  filter: ManagedProblemListFilter,
): SelectQueryBuilder<ProblemEntity> {
  if (filter.createdBy) {
    query.andWhere('p.createdBy = :createdBy', { createdBy: filter.createdBy });
  }
  if (!filter.includeDeleted) {
    query.andWhere('p.deletedAt IS NULL');
  }

  return query;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}
