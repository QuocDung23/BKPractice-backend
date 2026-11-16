import type { SupportedLanguage } from '@app/contracts';
import { InitialLearningSchema1700000003000 } from '@learning/database/migrations/1700000003000-InitialLearningSchema';
import { Lrn001ProblemManagement1700000004000 } from '@learning/database/migrations/1700000004000-Lrn001ProblemManagement';
import { Lrn002TestCaseManagement1700000007000 } from '@learning/database/migrations/1700000007000-Lrn002TestCaseManagement';
import { learningEntities } from '@learning/modules/learning.entities';
import { ConcurrentModificationError } from '@learning/modules/problems/application/errors/concurrent-modification.error';
import { DuplicateSlugError } from '@learning/modules/problems/domain/errors/duplicate-slug.error';
import {
  Problem,
  type CreateProblemInput,
} from '@learning/modules/problems/domain/problem.aggregate';
import {
  CreatedBy,
  EnabledLanguage,
  ExecutionLimits,
  FunctionContract,
  OopContract,
  ProblemStatement,
  ProblemTitle,
  Slug,
  StarterCode,
  TagReference,
  TopicReference,
} from '@learning/modules/problems/domain/value-objects';
import { DataSource } from 'typeorm';

import { ProblemPersistenceMapper } from './problem.persistence-mapper';
import { ProblemTypeOrmRepository } from './problem.typeorm-repository';
import { TypeOrmTransactionContext } from './typeorm-transaction-context';
import { TypeOrmTransactionRunner } from './typeorm-transaction-runner';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const TEST_DATABASE_NAME = TEST_DATABASE_URL
  ? decodeURIComponent(new URL(TEST_DATABASE_URL).pathname.replace(/^\//, ''))
  : '';

if (TEST_DATABASE_URL && !/(_test|_lrn001)$/.test(TEST_DATABASE_NAME)) {
  throw new Error(
    'TEST_DATABASE_URL must point to a database whose name ends with _test or _lrn001',
  );
}

const describeIntegration = TEST_DATABASE_URL ? describe : describe.skip;

if (!TEST_DATABASE_URL) {
  console.warn('TEST_DATABASE_URL is not set; skipping ProblemTypeOrmRepository integration tests');
}

const OWNER_ID = '00000000-0000-4000-8000-000000000011';
const OTHER_OWNER_ID = '00000000-0000-4000-8000-000000000012';
const TEST_NOW = new Date('2026-01-01T00:00:00.000Z');

let dataSource: DataSource;
let repository: ProblemTypeOrmRepository;
let runner: TypeOrmTransactionRunner;
let slugSequence = 0;
let clock = TEST_NOW.getTime();

describeIntegration('ProblemTypeOrmRepository', () => {
  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: TEST_DATABASE_URL,
      entities: learningEntities,
      migrations: [
        InitialLearningSchema1700000003000,
        Lrn001ProblemManagement1700000004000,
        Lrn002TestCaseManagement1700000007000,
      ],
      synchronize: false,
    });

    await dataSource.initialize();
    await dataSource.runMigrations();

    const context = new TypeOrmTransactionContext(dataSource);
    runner = new TypeOrmTransactionRunner(dataSource, context);
    repository = new ProblemTypeOrmRepository(context, new ProblemPersistenceMapper());
  });

  beforeEach(async () => {
    slugSequence = 0;
    clock = TEST_NOW.getTime();
    await dataSource.query(
      `TRUNCATE "problems", "topics", "tags", "problem_topics", "problem_tags",
        "problem_languages", "starter_codes", "test_cases", "problem_harnesses" RESTART IDENTITY CASCADE`,
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  describe('public list', () => {
    it('returns only published, non-deleted problems and applies filters with AND', async () => {
      const topicId = await insertTopic('arrays');
      const otherTopicId = await insertTopic('strings');
      const tagId = await insertTag('easy');

      const first = publishedProblem({
        title: new ProblemTitle('Alpha 100%_match'),
        topics: [new TopicReference(topicId)],
        tags: [new TagReference(tagId)],
        difficulty: 'EASY',
      });
      const second = publishedProblem({
        title: new ProblemTitle('Beta'),
        topics: [new TopicReference(otherTopicId)],
        difficulty: 'HARD',
      });
      const third = publishedProblem({
        title: new ProblemTitle('Gamma'),
        topics: [new TopicReference(topicId)],
        tags: [new TagReference(tagId)],
        difficulty: 'HARD',
      });
      const draft = draftProblem();
      const onHold = publishedProblem();
      onHold.hold(new Date(TEST_NOW.getTime() + 5_000));
      const deleted = publishedProblem();
      deleted.softDelete(new Date(TEST_NOW.getTime() + 6_000));

      await persist(first);
      await persist(second);
      await persist(third);
      await persist(draft);
      await persist(onHold);
      await persist(deleted);

      const all = await repository.listPublished({ page: 1, limit: 20 });

      expect(all.total).toBe(3);
      expect(new Set(all.items.map((problem) => problem.id.value))).toEqual(
        new Set([first.id.value, second.id.value, third.id.value]),
      );

      const byType = await repository.listPublished({
        problemType: 'STANDARD',
        page: 1,
        limit: 20,
      });
      expect(byType.total).toBe(3);

      const byDifficulty = await repository.listPublished({
        difficulty: 'HARD',
        page: 1,
        limit: 20,
      });
      expect(new Set(byDifficulty.items.map((problem) => problem.id.value))).toEqual(
        new Set([second.id.value, third.id.value]),
      );

      const byTopic = await repository.listPublished({
        topicId,
        page: 1,
        limit: 20,
      });
      expect(new Set(byTopic.items.map((problem) => problem.id.value))).toEqual(
        new Set([first.id.value, third.id.value]),
      );

      const byTag = await repository.listPublished({
        tagId,
        page: 1,
        limit: 20,
      });
      expect(new Set(byTag.items.map((problem) => problem.id.value))).toEqual(
        new Set([first.id.value, third.id.value]),
      );

      const byTopicAndTagAndDifficulty = await repository.listPublished({
        topicId,
        tagId,
        difficulty: 'HARD',
        page: 1,
        limit: 20,
      });
      expect(byTopicAndTagAndDifficulty.total).toBe(1);
      expect(byTopicAndTagAndDifficulty.items[0]?.id.value).toBe(third.id.value);

      const bySearch = await repository.listPublished({
        search: '100%_',
        page: 1,
        limit: 20,
      });
      expect(bySearch.total).toBe(1);
      expect(bySearch.items[0]?.id.value).toBe(first.id.value);

      const byStatement = await repository.listPublished({
        search: 'indices',
        page: 1,
        limit: 20,
      });
      expect(byStatement.total).toBe(0);

      const empty = await repository.listPublished({
        search: 'no-such-problem',
        page: 1,
        limit: 20,
      });
      expect(empty).toEqual({ items: [], total: 0, page: 1, limit: 20 });
    });

    it('paginates with created_at DESC, id DESC without dropping or duplicating rows', async () => {
      const sharedTime = new Date('2026-02-01T00:00:00.000Z');
      const problems = [
        publishedProblem({}, sharedTime),
        publishedProblem({}, sharedTime),
        publishedProblem({}, sharedTime),
      ];

      for (const problem of problems) {
        await persist(problem);
      }

      const firstPage = await repository.listPublished({ page: 1, limit: 2 });
      const secondPage = await repository.listPublished({ page: 2, limit: 2 });

      expect(firstPage.total).toBe(3);
      expect(firstPage.items).toHaveLength(2);
      expect(secondPage.items).toHaveLength(1);
      expect(new Set([...firstPage.items, ...secondPage.items].map((p) => p.id.value))).toEqual(
        new Set(problems.map((problem) => problem.id.value)),
      );
    });
  });

  describe('managed list', () => {
    it('lists every creator, includes deleted rows only when requested, and orders by updated_at', async () => {
      const ownedEarlier = publishedProblem({}, new Date('2026-03-01T00:00:00.000Z'));
      const ownedLater = publishedProblem({}, new Date('2026-03-02T00:00:00.000Z'));
      const ownedDeleted = publishedProblem({}, new Date('2026-03-03T00:00:00.000Z'));
      ownedDeleted.softDelete(new Date('2026-03-04T00:00:00.000Z'));
      const otherOwned = publishedProblem(
        { createdBy: new CreatedBy(OTHER_OWNER_ID) },
        new Date('2026-03-05T00:00:00.000Z'),
      );

      await persist(ownedEarlier);
      await persist(ownedLater);
      await persist(ownedDeleted);
      await persist(otherOwned);

      const active = await repository.listManaged({
        includeDeleted: false,
        page: 1,
        limit: 20,
      });

      expect(active.total).toBe(3);
      expect(active.items.map((problem) => problem.id.value)).toEqual([
        otherOwned.id.value,
        ownedLater.id.value,
        ownedEarlier.id.value,
      ]);

      const includingDeleted = await repository.listManaged({
        includeDeleted: true,
        page: 1,
        limit: 20,
      });

      expect(includingDeleted.total).toBe(4);
      expect(new Set(includingDeleted.items.map((problem) => problem.id.value))).toEqual(
        new Set([
          ownedEarlier.id.value,
          ownedLater.id.value,
          ownedDeleted.id.value,
          otherOwned.id.value,
        ]),
      );
      const lecturerOwned = await repository.listManaged({
        includeDeleted: false,
        createdBy: OWNER_ID,
        page: 1,
        limit: 20,
      });
      expect(lecturerOwned.total).toBe(2);
      expect(lecturerOwned.items.map((problem) => problem.id.value)).toEqual([
        ownedLater.id.value,
        ownedEarlier.id.value,
      ]);
    });
  });

  describe('slug', () => {
    it('keeps deleted rows in slug availability and allows excluding the current problem', async () => {
      const problem = publishedProblem();
      problem.softDelete(new Date(TEST_NOW.getTime() + 1_000));
      await persist(problem);

      expect(await repository.isSlugAvailable(problem.slug.value)).toBe(false);
      expect(await repository.isSlugAvailable(problem.slug.value, problem.id.value)).toBe(true);
    });

    it('allows exactly one concurrent insert for the same slug', async () => {
      const slug = new Slug('concurrent-slug');
      const first = draftProblem({ slug });
      const second = draftProblem({ slug });

      const results = await Promise.allSettled([
        runner.run(() => repository.save(first)),
        runner.run(() => repository.save(second)),
      ]);

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.filter((result) => result.status === 'rejected');
      expect(rejected).toHaveLength(1);
      expect(rejected[0]?.status).toBe('rejected');

      if (rejected[0]?.status === 'rejected') {
        expect(rejected[0].reason).toBeInstanceOf(DuplicateSlugError);
      }

      const rows: { count: string }[] = await dataSource.query(
        'SELECT COUNT(*)::text AS "count" FROM "problems" WHERE "slug" = $1',
        [slug.value],
      );
      expect(rows[0]?.count).toBe('1');
    });
  });

  describe('single-record lookups', () => {
    it('finds published problems by id or slug and excludes non-published states', async () => {
      const published = publishedProblem();
      const draft = draftProblem();
      const onHold = publishedProblem();
      onHold.hold(new Date(TEST_NOW.getTime() + 5_000));

      await persist(published);
      await persist(draft);
      await persist(onHold);

      expect((await repository.findPublishedByIdOrSlug(published.id.value))?.id.value).toBe(
        published.id.value,
      );
      expect((await repository.findPublishedByIdOrSlug(published.slug.value))?.id.value).toBe(
        published.id.value,
      );
      expect(await repository.findPublishedByIdOrSlug(draft.id.value)).toBeNull();
      expect(await repository.findPublishedByIdOrSlug(draft.slug.value)).toBeNull();
      expect(await repository.findPublishedByIdOrSlug(onHold.id.value)).toBeNull();
    });

    it('finds every creator and honors includeDeleted', async () => {
      const deleted = publishedProblem();
      deleted.softDelete(new Date(TEST_NOW.getTime() + 1_000));
      const otherOwned = publishedProblem({
        createdBy: new CreatedBy(OTHER_OWNER_ID),
      });

      await persist(deleted);
      await persist(otherOwned);

      expect(await repository.findManagedById(deleted.id.value, false)).toBeNull();
      expect((await repository.findManagedById(deleted.id.value, true))?.id.value).toBe(
        deleted.id.value,
      );
      expect((await repository.findManagedById(otherOwned.id.value, true))?.id.value).toBe(
        otherOwned.id.value,
      );
    });
  });

  describe('JSONB type_config', () => {
    it('round-trips FUNCTION contracts and rejects unsupported language keys', async () => {
      const functionContract = new FunctionContract({
        functionName: 'solve',
        parameters: [
          { name: 'values', type: 'number[]' },
          { name: 'target', type: 'number' },
        ],
        returnType: 'number[]',
      });
      const problem = draftProblem({
        problemType: 'FUNCTION',
        enabledLanguages: [new EnabledLanguage('python')],
        functionContracts: new Map<SupportedLanguage, FunctionContract>([
          ['python', functionContract],
        ]),
      });

      await persist(problem);

      const configRows: { typeConfig: unknown }[] = await dataSource.query(
        'SELECT "type_config" AS "typeConfig" FROM "problems" WHERE "id" = $1',
        [problem.id.value],
      );
      expect(getPath(configRows[0]?.typeConfig, 'languageContract', 'python', 'functionName')).toBe(
        'solve',
      );
      expect(
        getPath(configRows[0]?.typeConfig, 'languageContract', 'python', 'parameters'),
      ).toEqual([
        { name: 'values', type: 'number[]' },
        { name: 'target', type: 'number' },
      ]);

      const loaded = requireProblem(await repository.findById(problem.id.value));
      expect(loaded.functionContracts.get('python')?.functionName).toBe('solve');
      expect(loaded.functionContracts.get('python')?.parameters).toHaveLength(2);
      expect(loaded.oopContracts.size).toBe(0);

      await dataSource.query(
        `UPDATE "problems"
         SET "type_config" = $1::jsonb
         WHERE "id" = $2`,
        [
          JSON.stringify({
            languageContract: {
              COBOL: {
                functionName: 'solve',
                parameters: [],
                returnType: 'void',
              },
            },
          }),
          problem.id.value,
        ],
      );

      await expect(repository.findById(problem.id.value)).rejects.toThrow();
    });

    it('round-trips OOP contracts using constructor in JSONB and constructorContract in domain', async () => {
      const oopContract = new OopContract({
        structure: 'CLASS',
        name: 'Solution',
        constructorContract: {
          access: 'PUBLIC',
          parameters: [{ name: 'size', type: 'number' }],
        },
        methods: [
          {
            name: 'solve',
            access: 'PRIVATE',
            parameters: [{ name: 'values', type: 'number[]' }],
            returnType: 'number[]',
          },
        ],
      });
      const problem = draftProblem({
        problemType: 'OOP',
        enabledLanguages: [new EnabledLanguage('python')],
        oopContracts: new Map<SupportedLanguage, OopContract>([['python', oopContract]]),
      });

      await persist(problem);

      const configRows: { typeConfig: unknown }[] = await dataSource.query(
        'SELECT "type_config" AS "typeConfig" FROM "problems" WHERE "id" = $1',
        [problem.id.value],
      );
      expect(
        getPath(configRows[0]?.typeConfig, 'ooContract', 'python', 'constructor', 'access'),
      ).toBe('PUBLIC');
      expect(
        getPath(configRows[0]?.typeConfig, 'ooContract', 'python', 'constructorContract'),
      ).toBeUndefined();
      expect(
        getPath(configRows[0]?.typeConfig, 'ooContract', 'python', 'methods', '0', 'access'),
      ).toBe('PRIVATE');

      const loaded = requireProblem(await repository.findById(problem.id.value));
      const loadedContract = loaded.oopContracts.get('python');

      expect(loadedContract?.constructorContract?.access).toBe('PUBLIC');
      expect(loadedContract?.constructorContract?.parameters).toEqual([
        { name: 'size', type: 'number' },
      ]);
      expect(loadedContract?.methods[0]?.access).toBe('PRIVATE');
      expect(loadedContract?.methods[0]?.parameters).toEqual([
        { name: 'values', type: 'number[]' },
      ]);
    });

    it('rejects malformed JSONB type_config instead of silently dropping it', async () => {
      const problem = draftProblem();
      await persist(problem);

      await dataSource.query(
        `UPDATE "problems"
         SET "type_config" = $1::jsonb
         WHERE "id" = $2`,
        [
          JSON.stringify({
            languageContract: {
              python: {
                functionName: 123,
                parameters: [],
                returnType: 'void',
              },
            },
          }),
          problem.id.value,
        ],
      );

      await expect(repository.findById(problem.id.value)).rejects.toThrow();
    });

    it('maps null type_config to empty contract maps', async () => {
      const problem = draftProblem();

      await persist(problem);

      const loaded = requireProblem(await repository.findById(problem.id.value));

      expect(loaded.functionContracts.size).toBe(0);
      expect(loaded.oopContracts.size).toBe(0);
    });
  });

  describe('starter codes and enabled languages', () => {
    it('updates source_code and removes deleted starter rows', async () => {
      const problem = draftProblem({
        enabledLanguages: [new EnabledLanguage('python')],
        starterCodes: [new StarterCode({ language: 'python', sourceCode: 'print("old")' })],
      });
      await persist(problem);

      const loaded = requireProblem(await repository.findById(problem.id.value));
      const token = loaded.updatedAt;
      loaded.update(
        {
          starterCodes: [new StarterCode({ language: 'python', sourceCode: 'print("new")' })],
        },
        new Date('2026-04-01T00:00:00.000Z'),
      );
      await runner.run(() => repository.save(loaded, token));

      const starterRows: { sourceCode: string }[] = await dataSource.query(
        `SELECT "source_code" AS "sourceCode"
         FROM "starter_codes" WHERE "problem_id" = $1`,
        [problem.id.value],
      );
      expect(starterRows).toEqual([{ sourceCode: 'print("new")' }]);

      const loadedAgain = requireProblem(await repository.findById(problem.id.value));
      const secondToken = loadedAgain.updatedAt;
      loadedAgain.update({ starterCodes: [] }, new Date('2026-04-02T00:00:00.000Z'));
      await runner.run(() => repository.save(loadedAgain, secondToken));

      const countRows: { count: string }[] = await dataSource.query(
        'SELECT COUNT(*)::text AS "count" FROM "starter_codes" WHERE "problem_id" = $1',
        [problem.id.value],
      );
      expect(countRows[0]?.count).toBe('0');
    });

    it('disables a language row instead of deleting it', async () => {
      const problem = draftProblem({
        enabledLanguages: [new EnabledLanguage('python')],
      });
      await persist(problem);

      const loaded = requireProblem(await repository.findById(problem.id.value));
      const token = loaded.updatedAt;
      loaded.update({ enabledLanguages: [] }, new Date('2026-04-03T00:00:00.000Z'));
      await runner.run(() => repository.save(loaded, token));

      const rows: { enabled: boolean }[] = await dataSource.query(
        'SELECT "enabled" FROM "problem_languages" WHERE "problem_id" = $1',
        [problem.id.value],
      );
      expect(rows).toEqual([{ enabled: false }]);
    });
  });

  describe('optimistic concurrency', () => {
    it('rejects a stale token without writing child rows', async () => {
      const topicId = await insertTopic('cas-topic');
      const problem = publishedProblem({
        topics: [new TopicReference(topicId)],
        enabledLanguages: [new EnabledLanguage('python')],
        starterCodes: [new StarterCode({ language: 'python', sourceCode: 'old' })],
      });
      await persist(problem);

      const loaded = requireProblem(await repository.findById(problem.id.value));
      const staleToken = loaded.updatedAt;
      loaded.update(
        {
          title: new ProblemTitle('First update'),
        },
        new Date('2026-05-01T00:00:00.000Z'),
      );
      await runner.run(() => repository.save(loaded, staleToken));

      const fresh = requireProblem(await repository.findById(problem.id.value));
      fresh.update(
        {
          title: new ProblemTitle('Stale update'),
          topics: [],
          starterCodes: [],
        },
        new Date('2026-05-02T00:00:00.000Z'),
      );

      await expect(runner.run(() => repository.save(fresh, staleToken))).rejects.toBeInstanceOf(
        ConcurrentModificationError,
      );

      const topicRows: { count: string }[] = await dataSource.query(
        'SELECT COUNT(*)::text AS "count" FROM "problem_topics" WHERE "problem_id" = $1',
        [problem.id.value],
      );
      const starterRows: { count: string }[] = await dataSource.query(
        'SELECT COUNT(*)::text AS "count" FROM "starter_codes" WHERE "problem_id" = $1',
        [problem.id.value],
      );
      expect(topicRows[0]?.count).toBe('1');
      expect(starterRows[0]?.count).toBe('1');
    });

    it('accepts two sequential updates with fresh tokens and truncates milliseconds', async () => {
      const problem = draftProblem();
      await persist(problem);

      await dataSource.query(
        `UPDATE "problems" SET "updated_at" = '2026-05-10 00:00:00.123456+00'
         WHERE "id" = $1`,
        [problem.id.value],
      );

      const first = requireProblem(await repository.findById(problem.id.value));
      const firstToken = first.updatedAt;
      first.update(
        { title: new ProblemTitle('Sequential one') },
        new Date('2026-05-11T00:00:00.000Z'),
      );
      await runner.run(() => repository.save(first, firstToken));

      const second = requireProblem(await repository.findById(problem.id.value));
      const secondToken = second.updatedAt;
      second.update(
        { title: new ProblemTitle('Sequential two') },
        new Date('2026-05-12T00:00:00.000Z'),
      );
      await runner.run(() => repository.save(second, secondToken));

      const loaded = requireProblem(await repository.findById(problem.id.value));
      expect(loaded.title.value).toBe('Sequential two');
    });
  });

  describe('soft delete and restore', () => {
    it('soft deletes published and on-hold problems and restores the prior status', async () => {
      const published = publishedProblem();
      const onHold = publishedProblem();
      onHold.hold(new Date(TEST_NOW.getTime() + 1_000));
      const draft = draftProblem();

      await persist(published);
      await persist(onHold);
      await persist(draft);

      const publishedDeleteAt = new Date('2026-06-01T00:00:00.000Z');
      expect(
        await runner.run(() => repository.softDelete(published.id.value, publishedDeleteAt)),
      ).toBe(true);
      expect(
        await runner.run(() =>
          repository.softDelete(published.id.value, new Date('2026-06-02T00:00:00.000Z')),
        ),
      ).toBe(false);
      expect(
        await runner.run(() =>
          repository.softDelete(draft.id.value, new Date('2026-06-03T00:00:00.000Z')),
        ),
      ).toBe(false);

      const statusRows: { publishStatus: string; deletedAt: Date | null }[] =
        await dataSource.query(
          `SELECT "publish_status" AS "publishStatus", "deleted_at" AS "deletedAt"
           FROM "problems" WHERE "id" = $1`,
          [published.id.value],
        );
      expect(statusRows[0]?.publishStatus).toBe('PUBLISHED');
      expect(statusRows[0]?.deletedAt).not.toBeNull();
      expect(await repository.findById(published.id.value)).toBeNull();
      expect(await repository.findByIdIncludingDeleted(published.id.value)).not.toBeNull();

      const publicList = await repository.listPublished({ page: 1, limit: 20 });
      expect(publicList.total).toBe(0);

      expect(
        await runner.run(() =>
          repository.restore(published.id.value, new Date('2026-06-04T00:00:00.000Z')),
        ),
      ).toBe(true);
      expect(
        await runner.run(() =>
          repository.restore(published.id.value, new Date('2026-06-05T00:00:00.000Z')),
        ),
      ).toBe(false);

      const restoredStatusRows: { publishStatus: string; deletedAt: Date | null }[] =
        await dataSource.query(
          `SELECT "publish_status" AS "publishStatus", "deleted_at" AS "deletedAt"
           FROM "problems" WHERE "id" = $1`,
          [published.id.value],
        );
      expect(restoredStatusRows[0]?.publishStatus).toBe('PUBLISHED');
      expect(restoredStatusRows[0]?.deletedAt).toBeNull();
    });
  });

  describe('transaction rollback', () => {
    it('does not persist problem, joins, or starter codes when the transaction fails', async () => {
      const topicId = await insertTopic('rollback-topic');
      const problem = draftProblem({
        topics: [new TopicReference(topicId)],
        enabledLanguages: [new EnabledLanguage('python')],
        starterCodes: [new StarterCode({ language: 'python', sourceCode: 'print("rollback")' })],
      });

      await expect(
        runner.run(async () => {
          await repository.save(problem);
          throw new Error('rollback requested');
        }),
      ).rejects.toThrow('rollback requested');

      const problemRows: { count: string }[] = await dataSource.query(
        'SELECT COUNT(*)::text AS "count" FROM "problems"',
      );
      const topicRows: { count: string }[] = await dataSource.query(
        'SELECT COUNT(*)::text AS "count" FROM "problem_topics"',
      );
      const starterRows: { count: string }[] = await dataSource.query(
        'SELECT COUNT(*)::text AS "count" FROM "starter_codes"',
      );

      expect(problemRows[0]?.count).toBe('0');
      expect(topicRows[0]?.count).toBe('0');
      expect(starterRows[0]?.count).toBe('0');
    });
  });

  describe('service boundary', () => {
    it('only maps Learning tables and relations', () => {
      const tableNames = dataSource.entityMetadatas.map((metadata) => metadata.tableName);

      expect(tableNames).not.toContain('users');
      expect(tableNames).not.toContain('submissions');
      expect(tableNames).not.toContain('discussion_posts');

      const relatedTables = dataSource.entityMetadatas.flatMap((metadata) =>
        metadata.relations.map((relation) => relation.inverseEntityMetadata.tableName),
      );
      expect(relatedTables.every((table) => tableNames.includes(table))).toBe(true);
    });
  });
});

async function insertTopic(name: string): Promise<string> {
  const rows: { id: string }[] = await dataSource.query(
    'INSERT INTO "topics" ("name") VALUES ($1) RETURNING "id"',
    [name],
  );

  if (rows[0] === undefined) {
    throw new Error('topic insert returned no row');
  }

  return rows[0].id;
}

async function insertTag(name: string): Promise<string> {
  const rows: { id: string }[] = await dataSource.query(
    'INSERT INTO "tags" ("name") VALUES ($1) RETURNING "id"',
    [name],
  );

  if (rows[0] === undefined) {
    throw new Error('tag insert returned no row');
  }

  return rows[0].id;
}

function draftProblem(overrides: Partial<CreateProblemInput> = {}, now = nextClock()): Problem {
  slugSequence += 1;

  return Problem.create(
    {
      slug: new Slug(`problem-${slugSequence}`),
      title: new ProblemTitle('Two Sum'),
      statement: new ProblemStatement('Given an array, return the indices of two numbers.'),
      problemType: 'STANDARD',
      difficulty: 'EASY',
      executionLimits: new ExecutionLimits({
        timeLimitMs: 1_000,
        memoryLimitMb: 256,
      }),
      createdBy: new CreatedBy(OWNER_ID),
      ...overrides,
    },
    { now },
  );
}

function publishedProblem(overrides: Partial<CreateProblemInput> = {}, now = nextClock()): Problem {
  const problem = draftProblem(overrides, now);
  problem.publish(now);

  return problem;
}

function nextClock(): Date {
  clock += 1;

  return new Date(clock);
}

async function persist(problem: Problem): Promise<void> {
  await runner.run(() => repository.save(problem));
}

function requireProblem(problem: Problem | null): Problem {
  if (problem === null) {
    throw new Error('expected problem to exist');
  }

  return problem;
}

function getPath(root: unknown, ...keys: string[]): unknown {
  let current = root;

  for (const key of keys) {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[key];
  }

  return current;
}
