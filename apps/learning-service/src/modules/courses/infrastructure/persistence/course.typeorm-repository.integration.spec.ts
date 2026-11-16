import { Lrn008SelfStudy1700000010000 } from '@learning/database/migrations/1700000010000-Lrn008SelfStudy';
import { DataSource } from 'typeorm';

import {
  DuplicateCourseSlugError,
  ProblemNotAttachableError,
} from '@/modules/courses/application/errors';
import { Course } from '@/modules/courses/domain';
import { ProblemAlreadyInCourse } from '@/modules/courses/domain/errors';
import {
  ChapterDescription,
  ChapterId,
  ChapterTitle,
  ProblemReference,
} from '@/modules/courses/domain/value-objects';
import { CourseTypeOrmRepository } from '@/modules/courses/infrastructure/persistence/course.typeorm-repository';
import { CourseTypeOrmTransactionContext } from '@/modules/courses/infrastructure/persistence/course.typeorm-transaction-context';
import { CourseTypeOrmTransactionRunner } from '@/modules/courses/infrastructure/persistence/course.typeorm-transaction-runner';
import {
  assertTestDatabase,
  learningDataSourceOptions,
  TEST_DATABASE_URL,
  upsertProblem,
  courseWithProblem,
  draftCourse,
  PROBLEM_ID,
  OWNER_ID,
  OTHER_ID,
} from '@/modules/courses/testing';

assertTestDatabase();

const describeIntegration = TEST_DATABASE_URL ? describe : describe.skip;

if (!TEST_DATABASE_URL) {
  console.warn('TEST_DATABASE_URL is not set; skipping CourseTypeOrmRepository integration tests');
}

const SECOND_PROBLEM = '00000000-0000-4000-8000-0000000000d4';

let dataSource: DataSource;

let repository: CourseTypeOrmRepository;

let runner: CourseTypeOrmTransactionRunner;

let context: CourseTypeOrmTransactionContext;

let sequence = 0;

const nextSlug = (): string => `it-course-${Date.now()}-${(sequence += 1)}`;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const save = (course: Course): Promise<void> => runner.run(() => repository.save(course));

describeIntegration('CourseTypeOrmRepository (real PostgreSQL)', () => {
  beforeAll(async () => {
    dataSource = new DataSource(learningDataSourceOptions());
    await dataSource.initialize();
    await dataSource.runMigrations();
    await upsertProblem(dataSource, { id: PROBLEM_ID });
    await upsertProblem(dataSource, { id: SECOND_PROBLEM });

    context = new CourseTypeOrmTransactionContext(dataSource);
    runner = new CourseTypeOrmTransactionRunner(dataSource, context);
    repository = new CourseTypeOrmRepository(context);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  describe('persistence', () => {
    it('round-trips a course with ordered chapters and problem references', async () => {
      const course = courseWithProblem(PROBLEM_ID, nextSlug());
      await save(course);

      const loaded = await repository.findById(course.id.value);

      expect(loaded?.chapters.map((c) => c.problemRefs.map((p) => p.value))).toEqual([
        [PROBLEM_ID],
      ]);
      expect(loaded?.slug.value).toBe(course.slug.value);
      expect(loaded?.status).toBe('DRAFT');
    });

    it('retains historical Course membership after detaching a Problem', async () => {
      const course = courseWithProblem(PROBLEM_ID, nextSlug());
      await save(course);
      await runner.run(async () => {
        const loaded = (await repository.loadForUpdate(course.id.value))!;
        loaded.removeProblemFromChapter(loaded.chapters[0]!.id, new ProblemReference(PROBLEM_ID));
        await repository.save(loaded);
      });
      expect((await repository.findById(course.id.value))?.chapters[0]?.problemRefs).toHaveLength(
        0,
      );
      expect(
        await dataSource.query(
          'SELECT problem_id FROM course_problem_history WHERE course_id = $1',
          [course.id.value],
        ),
      ).toEqual([{ problem_id: PROBLEM_ID }]);
    });

    it('keeps chapter and problem order across saves', async () => {
      const course = courseWithProblem(PROBLEM_ID, nextSlug());
      await save(course);
      await runner.run(async () => {
        const loaded = (await repository.loadForUpdate(course.id.value))!;
        loaded.addProblemToChapter(
          loaded.chapters[0]!.id,
          new ProblemReference(SECOND_PROBLEM),
          new Date(),
          0,
        );
        await repository.save(loaded);
      });

      const loaded = await repository.findById(course.id.value);

      expect(loaded?.chapters[0]!.problemRefs.map((p) => p.value)).toEqual([
        SECOND_PROBLEM,
        PROBLEM_ID,
      ]);
    });

    it('refuses writes outside a transaction', async () => {
      await expect(repository.save(draftCourse(nextSlug()))).rejects.toThrow(
        'Course write requires an active transaction',
      );
    });

    it('rolls back the whole unit of work when it fails', async () => {
      const course = draftCourse(nextSlug());

      await expect(
        runner.run(async () => {
          await repository.save(course);
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');

      expect(await repository.findByIdIncludingDeleted(course.id.value)).toBeNull();
    });

    it('persists soft delete and restore through save', async () => {
      const course = courseWithProblem(PROBLEM_ID, nextSlug());
      course.publish();
      await save(course);

      await runner.run(async () => {
        const loaded = await repository.loadForUpdate(course.id.value);
        loaded!.softDelete(new Date());
        await repository.save(loaded!);
      });
      expect(await repository.findById(course.id.value)).toBeNull();
      const published = await repository.listPublished({ page: 1, limit: 100 });
      expect(published.items.map((c) => c.id.value)).not.toContain(course.id.value);

      await runner.run(async () => {
        const loaded = await repository.loadForUpdate(course.id.value, true);
        loaded!.restore(new Date());
        await repository.save(loaded!);
      });
      expect((await repository.findById(course.id.value))?.status).toBe('PUBLISHED');
    });
  });

  describe('queries', () => {
    it('finds a published course by id or by a non-UUID slug (no uuid cast error)', async () => {
      const slug = nextSlug();
      const course = courseWithProblem(PROBLEM_ID, slug);
      course.publish();
      await save(course);

      expect((await repository.findPublishedByIdOrSlug(slug))?.id.value).toBe(course.id.value);
      expect((await repository.findPublishedByIdOrSlug(course.id.value))?.slug.value).toBe(slug);
      expect(await repository.findPublishedByIdOrSlug('missing-slug')).toBeNull();
    });

    it('never returns drafts, held or deleted courses to learners', async () => {
      const slug = nextSlug();
      const draft = courseWithProblem(PROBLEM_ID, `${slug}-draft`);
      const held = courseWithProblem(PROBLEM_ID, `${slug}-held`);
      held.publish();
      held.hold();
      await save(draft);
      await save(held);

      expect(await repository.findPublishedByIdOrSlug(`${slug}-draft`)).toBeNull();
      expect(await repository.findPublishedByIdOrSlug(`${slug}-held`)).toBeNull();
    });

    it('searches titles case-insensitively and treats % and _ literally', async () => {
      const slug = nextSlug();
      const course = courseWithProblem(PROBLEM_ID, slug);
      course.publish();
      await save(course);

      const hit = await repository.listPublished({ page: 1, limit: 100, search: 'INTRO c' });
      const wildcard = await repository.listPublished({ page: 1, limit: 100, search: '%' });
      const managed = await repository.listManaged({
        includeDeleted: false,
        page: 1,
        limit: 100,
        search: 'intro',
      });

      expect(hit.items.map((c) => c.slug.value)).toContain(slug);
      expect(wildcard.items).toHaveLength(0);
      expect(managed.items.map((c) => c.slug.value)).toContain(slug);
    });

    it('filters the managed Course list by Lecturer ownership', async () => {
      const owned = draftCourse(nextSlug(), OWNER_ID);
      const other = draftCourse(nextSlug(), OTHER_ID);
      await save(owned);
      await save(other);
      const result = await repository.listManaged({
        includeDeleted: false,
        createdBy: OWNER_ID,
        page: 1,
        limit: 100,
      });
      expect(result.items.map((course) => course.id.value)).toContain(owned.id.value);
      expect(result.items.map((course) => course.id.value)).not.toContain(other.id.value);
    });
  });

  describe('concurrency', () => {
    it('serialises concurrent writers on the same course with a row lock', async () => {
      const course = draftCourse(nextSlug());
      await save(course);
      const events: string[] = [];

      const first = runner.run(async () => {
        await repository.loadForUpdate(course.id.value);
        events.push('first-locked');
        await sleep(400);
        events.push('first-commit');
      });
      await sleep(100);
      const second = runner.run(async () => {
        await repository.loadForUpdate(course.id.value);
        events.push('second-locked');
      });
      await Promise.all([first, second]);

      expect(events).toEqual(['first-locked', 'first-commit', 'second-locked']);
    });

    it('lets exactly one of two concurrent attaches of the same problem win', async () => {
      const course = draftCourse(nextSlug());
      const chapterId = course.addChapter({
        title: new ChapterTitle('A'),
        description: new ChapterDescription(null),
      });
      await save(course);
      const attach = () =>
        runner.run(async () => {
          const loaded = (await repository.loadForUpdate(course.id.value))!;
          loaded.addProblemToChapter(chapterId, new ProblemReference(PROBLEM_ID));
          await sleep(150);
          await repository.save(loaded);
        });

      const results = await Promise.allSettled([attach(), attach()]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect(rejected.reason).toBeInstanceOf(ProblemAlreadyInCourse);
      expect((await repository.findById(course.id.value))!.chapters[0]!.problemRefs).toHaveLength(
        1,
      );
    });

    it('returns null from loadForUpdate for an unknown course', async () => {
      const result = await runner.run(() =>
        repository.loadForUpdate('00000000-0000-4000-8000-0000000000ee'),
      );

      expect(result).toBeNull();
    });
  });

  describe('database constraints (LRN-003 plan)', () => {
    it('maps UNIQUE (slug) to DuplicateCourseSlugError', async () => {
      const slug = nextSlug();
      await save(draftCourse(slug));

      await expect(save(draftCourse(slug))).rejects.toBeInstanceOf(DuplicateCourseSlugError);
      expect(await repository.isSlugAvailable(slug)).toBe(false);
    });

    it('maps UNIQUE (course_id, problem_id) to ProblemAlreadyInCourse', async () => {
      const course = courseWithProblem(PROBLEM_ID, nextSlug());
      await save(course);
      // Bỏ qua bất biến của aggregate để chứng minh DB cũng chặn trùng.
      const snapshot = course.toSnapshot();
      const duplicated = Course.rehydrate({
        ...snapshot,
        chapters: [...snapshot.chapters, { ...snapshot.chapters[0]!, id: ChapterId.generate() }],
      });

      await expect(save(duplicated)).rejects.toBeInstanceOf(ProblemAlreadyInCourse);
    });

    it('maps the problem FK (ON DELETE RESTRICT target) to ProblemNotAttachableError', async () => {
      const course = courseWithProblem('00000000-0000-4000-8000-0000000fffff', nextSlug());

      await expect(save(course)).rejects.toBeInstanceOf(ProblemNotAttachableError);
      expect(await repository.findByIdIncludingDeleted(course.id.value)).toBeNull();
    });

    it('stores status as an enum and rejects unknown values', async () => {
      const course = draftCourse(nextSlug());
      await save(course);

      await expect(
        dataSource.query(`UPDATE "courses" SET "status" = 'ARCHIVED' WHERE "id" = $1`, [
          course.id.value,
        ]),
      ).rejects.toThrow(/invalid input value for enum/);
    });

    it('enforces description length CHECKs at 20000 (course) and 5000 (chapter)', async () => {
      const course = courseWithProblem(PROBLEM_ID, nextSlug());
      await save(course);
      const chapterId = course.chapters[0]!.id.value;

      await expect(
        dataSource.query(`UPDATE "courses" SET "description" = $2 WHERE "id" = $1`, [
          course.id.value,
          'a'.repeat(20001),
        ]),
      ).rejects.toThrow(/CHK_courses_description_length/);
      await expect(
        dataSource.query(`UPDATE "chapters" SET "description" = $2 WHERE "id" = $1`, [
          chapterId,
          'a'.repeat(5001),
        ]),
      ).rejects.toThrow(/CHK_chapters_description_length/);
    });

    it('keeps chapter_problems.course_id in step with its chapter (composite FK)', async () => {
      const course = courseWithProblem(PROBLEM_ID, nextSlug());
      const other = draftCourse(nextSlug());
      await save(course);
      await save(other);

      await expect(
        dataSource.query(`UPDATE "chapter_problems" SET "course_id" = $2 WHERE "chapter_id" = $1`, [
          course.chapters[0]!.id.value,
          other.id.value,
        ]),
      ).rejects.toThrow(/FK_chapter_problems_chapter_course/);
    });

    it('restricts hard deletion of a problem that a course references', async () => {
      const referenced = '00000000-0000-4000-8000-0000000abcde';
      await upsertProblem(dataSource, { id: referenced });
      await save(courseWithProblem(referenced, nextSlug()));

      await expect(
        dataSource.query(`DELETE FROM "problems" WHERE "id" = $1`, [referenced]),
      ).rejects.toThrow(/FK_chapter_problems_problem/);
    });

    it('cascades hard delete to chapters and chapter problems', async () => {
      const course = courseWithProblem(PROBLEM_ID, nextSlug());
      await save(course);

      expect(await runner.run(() => repository.hardDelete(course.id.value))).toBe(true);

      for (const table of ['chapters', 'chapter_problems']) {
        const rows: unknown[] = await dataSource.query(
          `SELECT 1 FROM "${table}" WHERE "course_id" = $1`,
          [course.id.value],
        );
        expect(rows).toHaveLength(0);
      }
    });
  });

  describe('migration 1700000010000 (LRN-008)', () => {
    it('drops retired tables and restores their empty schema on revert', async () => {
      const course = courseWithProblem(PROBLEM_ID, nextSlug());
      course.publish();
      await save(course);

      for (const table of ['classes', 'enrollments', 'assignments', 'assignment_problems']) {
        const [row] = await dataSource.query<Array<{ exists: string | null }>>(
          'SELECT to_regclass($1) AS "exists"',
          [table],
        );
        expect(row?.exists).toBeNull();
      }

      const queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      try {
        const migration = new Lrn008SelfStudy1700000010000();
        await migration.down(queryRunner);
        const restored = (await queryRunner.query('SELECT to_regclass($1) AS "exists"', [
          'classes',
        ])) as Array<{ exists: string | null }>;
        expect(restored[0]?.exists).toBe('classes');
        await migration.up(queryRunner);
      } finally {
        await queryRunner.rollbackTransaction();
        await queryRunner.release();
      }

      expect((await repository.findById(course.id.value))?.status).toBe('PUBLISHED');
      expect((await repository.findById(course.id.value))?.chapters[0]!.problemRefs).toHaveLength(
        1,
      );
    });
  });
});
