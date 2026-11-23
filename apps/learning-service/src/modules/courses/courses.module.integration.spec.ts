import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';

import { RemoveDemoTaggedProblems1700000012500 } from '@learning/database/migrations/1700000012500-RemoveDemoTaggedProblems';
import { RemoveDemoProblems1700000013000 } from '@learning/database/migrations/1700000013000-RemoveDemoProblems';
import { ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { CoursesModule } from '@/modules/courses/courses.module';
import {
  assertTestDatabase,
  learningDataSourceOptions,
  TEST_DATABASE_URL,
  upsertProblem,
  ALL_COURSE_PERMISSIONS,
  OTHER_ID,
  OWNER_ID,
} from '@/modules/courses/testing';

assertTestDatabase();

const describeIntegration = TEST_DATABASE_URL ? describe : describe.skip;

const admin = {
  'content-type': 'application/json',
  'x-auth-user-id': OWNER_ID,
  'x-auth-roles': 'ADMIN',
  'x-auth-permissions': ALL_COURSE_PERMISSIONS.join(','),
};

const student = {
  'content-type': 'application/json',
  'x-auth-user-id': OTHER_ID,
  'x-auth-roles': 'STUDENT',
};

const PUBLISHED_PROBLEM = '00000000-0000-4000-8000-0000000000c3';

const HELD_PROBLEM = '00000000-0000-4000-8000-0000000000d4';

const DRAFT_PROBLEM = '00000000-0000-4000-8000-0000000000e5';

describeIntegration('CoursesModule wiring (real PostgreSQL)', () => {
  let app: NestExpressApplication;
  let dataSource: DataSource;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ INTERNAL_SERVICE_SECRET: 'integration-test-only' })],
        }),
        TypeOrmModule.forRoot({
          ...learningDataSourceOptions({ extra: { max: 1, connectionTimeoutMillis: 1500 } }),
          migrationsRun: true,
        }),
        CoursesModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.listen(0, '127.0.0.1');
    dataSource = app.get(DataSource);
    const address = (app.getHttpServer() as { address(): AddressInfo | string | null }).address();
    if (address === null || typeof address === 'string') throw new Error('Expected a TCP port');
    baseUrl = `http://127.0.0.1:${address.port}`;
    await upsertProblem(dataSource, {
      id: PUBLISHED_PROBLEM,
      slug: 'wiring-published',
      title: 'Published one',
    });
    await upsertProblem(dataSource, { id: HELD_PROBLEM, slug: 'wiring-held', title: 'Held one' });
    await upsertProblem(dataSource, {
      id: DRAFT_PROBLEM,
      slug: 'wiring-draft',
      title: 'Draft of someone else',
      publishStatus: 'DRAFT',
      createdBy: OTHER_ID,
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  const call = async (
    method: string,
    path: string,
    options: { headers?: Record<string, string>; body?: unknown } = {},
  ) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: options.headers ?? admin,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const text = await response.text();
    return {
      status: response.status,
      body: (text ? JSON.parse(text) : {}) as Record<string, unknown>,
    };
  };

  const list = (value: unknown) => value as Array<Record<string, unknown>>;

  it('removes only DEMO-prefixed problems while keeping published courses viable', async () => {
    const migration = new RemoveDemoProblems1700000013000();
    const courseId = randomUUID();
    const chapterId = randomUUID();
    const demoId = randomUUID();
    const draftDemoId = randomUUID();
    const regularId = randomUUID();
    const quizId = randomUUID();
    const revisionId = randomUUID();
    const slug = `remove-demo-${courseId}`;
    const runner = dataSource.createQueryRunner();

    await runner.startTransaction();
    try {
      await runner.query(
        `INSERT INTO courses (id, slug, title, created_by, status)
         VALUES ($1, $2, 'Migration fixture', $3, 'PUBLISHED')`,
        [courseId, slug, OWNER_ID],
      );
      await runner.query(`INSERT INTO chapters (id, course_id, title) VALUES ($1, $2, 'Chapter')`, [
        chapterId,
        courseId,
      ]);
      await runner.query(
        `INSERT INTO problems (id, slug, title, description, problem_type, difficulty, publish_status, created_by)
         VALUES ($1, $1::uuid::text, '[DEMO] Published', 'Fixture', 'STANDARD', 'EASY', 'PUBLISHED', $4),
                ($2, $2::uuid::text, E'\t[demo] Draft', 'Fixture', 'STANDARD', 'EASY', 'DRAFT', $4),
                ($3, $3::uuid::text, 'Bài tập về nhãn [DEMO]', 'Fixture', 'STANDARD', 'EASY', 'PUBLISHED', $4)`,
        [demoId, draftDemoId, regularId, OWNER_ID],
      );
      await runner.query(
        `INSERT INTO chapter_problems (chapter_id, course_id, problem_id) VALUES ($1, $2, $3)`,
        [chapterId, courseId, demoId],
      );
      await runner.query(
        `INSERT INTO course_problem_history (course_id, problem_id) VALUES ($1, $2)`,
        [courseId, demoId],
      );
      await runner.query(
        `INSERT INTO test_cases (problem_id, expected_output) VALUES ($1, '1'), ($2, '1')`,
        [demoId, regularId],
      );
      await runner.query(
        `INSERT INTO progress (user_id, problem_id, status, solved_at) VALUES ($1, $2, 'SOLVED', now())`,
        [OTHER_ID, demoId],
      );

      await runner.query('SAVEPOINT before_demo_cleanup');
      await expect(migration.up(runner)).rejects.toThrow(slug);
      await runner.query('ROLLBACK TO SAVEPOINT before_demo_cleanup');
      expect(await runner.query('SELECT id FROM problems WHERE id = $1', [demoId])).toEqual([
        { id: demoId },
      ]);

      await runner.query('SAVEPOINT before_demo_hold');
      await runner.query(`UPDATE courses SET slug = $1 WHERE id = $2`, [
        'demo-course-1794753018834',
        courseId,
      ]);
      await migration.up(runner);
      expect(await runner.query('SELECT status FROM courses WHERE id = $1', [courseId])).toEqual([
        { status: 'ON_HOLD' },
      ]);
      expect(await runner.query('SELECT id FROM problems WHERE id = $1', [demoId])).toEqual([]);
      await runner.query('ROLLBACK TO SAVEPOINT before_demo_hold');

      await runner.query(
        `INSERT INTO quizzes (id, created_by, status, published_revision_id, client_request_id, request_hash, created_at, updated_at)
         VALUES ($1, $2, 'PUBLISHED', $3, $1, 'fixture', now(), now())`,
        [quizId, OWNER_ID, revisionId],
      );
      await runner.query(
        `INSERT INTO quiz_revisions (id, quiz_id, revision, title, published_at, created_at)
         VALUES ($1, $2, 1, 'Retained quiz', now(), now())`,
        [revisionId, quizId],
      );
      await runner.query(
        `INSERT INTO chapter_quizzes (id, chapter_id, quiz_id, display_order) VALUES ($1, $2, $3, 0)`,
        [randomUUID(), chapterId, quizId],
      );

      await migration.up(runner);
      await migration.up(runner);

      expect(
        await runner.query(`SELECT id FROM problems WHERE id = ANY($1::uuid[])`, [
          [demoId, draftDemoId, regularId],
        ]),
      ).toEqual([{ id: regularId }]);
      expect(
        await runner.query('SELECT id FROM chapter_problems WHERE chapter_id = $1', [chapterId]),
      ).toEqual([]);
      expect(
        await runner.query('SELECT problem_id FROM course_problem_history WHERE course_id = $1', [
          courseId,
        ]),
      ).toEqual([]);
      expect(
        await runner.query(`SELECT problem_id FROM test_cases WHERE problem_id IN ($1, $2)`, [
          demoId,
          regularId,
        ]),
      ).toEqual([{ problem_id: regularId }]);
      expect(await runner.query(`SELECT status FROM courses WHERE id = $1`, [courseId])).toEqual([
        { status: 'PUBLISHED' },
      ]);
      expect(
        await runner.query('SELECT quiz_id FROM chapter_quizzes WHERE chapter_id = $1', [
          chapterId,
        ]),
      ).toEqual([{ quiz_id: quizId }]);
      expect(
        await runner.query(
          'SELECT problem_id FROM progress WHERE user_id = $1 AND problem_id = $2',
          [OTHER_ID, demoId],
        ),
      ).toEqual([{ problem_id: demoId }]);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });

  it('cleans demo markers in titles and slugs along with their foreign-key rows', async () => {
    const migration = new RemoveDemoTaggedProblems1700000012500();
    const emptyCourse = randomUUID();
    const keptCourse = randomUUID();
    const emptyChapter = randomUUID();
    const keptChapter = randomUUID();
    const demoTitle = randomUUID();
    const demoSlug = randomUUID();
    const demoPrefix = randomUUID();
    const regular = randomUUID();
    const runner = dataSource.createQueryRunner();

    await runner.startTransaction();
    try {
      await runner.query(
        `INSERT INTO courses (id, slug, title, created_by, status)
         VALUES ($1, $1::uuid::text, 'Empty after cleanup', $3, 'PUBLISHED'),
                ($2, $2::uuid::text, 'Kept after cleanup', $3, 'PUBLISHED')`,
        [emptyCourse, keptCourse, OWNER_ID],
      );
      await runner.query(
        `INSERT INTO chapters (id, course_id, title) VALUES ($1, $2, 'Chapter'), ($3, $4, 'Chapter')`,
        [emptyChapter, emptyCourse, keptChapter, keptCourse],
      );
      await runner.query(
        `INSERT INTO problems (id, slug, title, description, problem_type, difficulty, publish_status, created_by)
         VALUES ($1, $1::uuid::text, 'Mảng [DEMO]', 'Fixture', 'STANDARD', 'EASY', 'PUBLISHED', $5),
                ($2, 'cleanup-demo123-' || $2::uuid::text, 'Mảng', 'Fixture', 'STANDARD', 'EASY', 'PUBLISHED', $5),
                ($3, $3::uuid::text, '[DEMO] Bài duy nhất', 'Fixture', 'STANDARD', 'EASY', 'PUBLISHED', $5),
                ($4, $4::uuid::text, 'Demonstration về mảng', 'Fixture', 'STANDARD', 'EASY', 'PUBLISHED', $5)`,
        [demoTitle, demoSlug, demoPrefix, regular, OWNER_ID],
      );
      await runner.query(
        `INSERT INTO chapter_problems (chapter_id, course_id, problem_id, display_order)
         VALUES ($1, $2, $3, 0), ($4, $5, $6, 0), ($4, $5, $7, 1), ($4, $5, $8, 2)`,
        [
          emptyChapter,
          emptyCourse,
          demoPrefix,
          keptChapter,
          keptCourse,
          demoTitle,
          demoSlug,
          regular,
        ],
      );
      await runner.query(
        `INSERT INTO course_problem_history (course_id, problem_id)
         SELECT course_id, problem_id FROM chapter_problems WHERE course_id IN ($1, $2)`,
        [emptyCourse, keptCourse],
      );
      await runner.query(
        `INSERT INTO test_cases (problem_id, expected_output) VALUES ($1, '1'), ($2, '1'), ($3, '1')`,
        [demoTitle, demoSlug, regular],
      );

      await migration.up(runner);
      await new RemoveDemoProblems1700000013000().up(runner);
      await migration.up(runner);

      expect(
        await runner.query('SELECT id FROM problems WHERE id IN ($1, $2, $3, $4)', [
          demoTitle,
          demoSlug,
          demoPrefix,
          regular,
        ]),
      ).toEqual([{ id: regular }]);
      expect(await runner.query('SELECT status FROM courses WHERE id = $1', [emptyCourse])).toEqual(
        [{ status: 'ON_HOLD' }],
      );
      expect(await runner.query('SELECT status FROM courses WHERE id = $1', [keptCourse])).toEqual([
        { status: 'PUBLISHED' },
      ]);
      expect(
        await runner.query('SELECT problem_id FROM chapter_problems WHERE course_id IN ($1, $2)', [
          emptyCourse,
          keptCourse,
        ]),
      ).toEqual([{ problem_id: regular }]);
      expect(
        await runner.query(
          'SELECT problem_id FROM course_problem_history WHERE course_id IN ($1, $2)',
          [emptyCourse, keptCourse],
        ),
      ).toEqual([{ problem_id: regular }]);
      expect(
        await runner.query(`SELECT problem_id FROM test_cases WHERE problem_id IN ($1, $2, $3)`, [
          demoTitle,
          demoSlug,
          regular,
        ]),
      ).toEqual([{ problem_id: regular }]);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });

  it('serves the whole course lifecycle against the database', async () => {
    const slug = `wiring-${Date.now()}`;

    // tạo + slug trùng
    const created = await call('POST', '/api/courses', { body: { slug, title: 'Wiring' } });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    expect((await call('POST', '/api/courses', { body: { slug, title: 'Again' } })).status).toBe(
      409,
    );

    // ADMIN thêm được Problem nháp của ADMIN khác; người học vẫn chỉ thấy bài công khai.
    const withChapter = await call('POST', `/api/courses/${id}/chapters`, {
      body: { title: 'Ch 1' },
    });
    const chapterId = list(withChapter.body.chapters)[0]!.id as string;
    const attach = (problemId: string) =>
      call('POST', `/api/courses/${id}/chapters/${chapterId}/problems`, { body: { problemId } });
    expect((await attach(DRAFT_PROBLEM)).status).toBe(201);
    expect((await attach(PUBLISHED_PROBLEM)).status).toBe(201);
    expect((await attach(PUBLISHED_PROBLEM)).status).toBe(409);
    expect((await attach(HELD_PROBLEM)).status).toBe(201);

    // readiness + publish
    const managed = await call('GET', `/api/courses/managed/${id}`);
    expect(managed.body.readiness).toEqual({ ready: true, issues: [] });
    expect((await call('POST', `/api/courses/${id}/publish`)).status).toBe(200);

    // người học chỉ thấy Problem PUBLISHED chưa xoá; ON_HOLD / xoá mềm bị ẩn rồi hiện lại đúng chỗ
    const visible = async () => {
      const res = await call('GET', `/api/courses/${slug}`, { headers: student });
      expect(res.status).toBe(200);
      return list(list(res.body.chapters)[0]!.problems).map((p) => p.slug);
    };
    expect(await visible()).toEqual(['wiring-published', 'wiring-held']);
    await dataSource.query(`UPDATE "problems" SET "publish_status" = 'ON_HOLD' WHERE "id" = $1`, [
      PUBLISHED_PROBLEM,
    ]);
    expect(await visible()).toEqual(['wiring-held']);
    await dataSource.query(`UPDATE "problems" SET "deleted_at" = now() WHERE "id" = $1`, [
      HELD_PROBLEM,
    ]);
    expect(await visible()).toEqual([]);
    await dataSource.query(`UPDATE "problems" SET "publish_status" = 'PUBLISHED' WHERE "id" = $1`, [
      PUBLISHED_PROBLEM,
    ]);
    await dataSource.query(`UPDATE "problems" SET "deleted_at" = NULL WHERE "id" = $1`, [
      HELD_PROBLEM,
    ]);
    expect(await visible()).toEqual(['wiring-published', 'wiring-held']);

    // AC-019: không gỡ được Problem PUBLISHED duy nhất
    await dataSource.query(`UPDATE "problems" SET "publish_status" = 'ON_HOLD' WHERE "id" = $1`, [
      HELD_PROBLEM,
    ]);
    const detach = await call(
      'DELETE',
      `/api/courses/${id}/chapters/${chapterId}/problems/${PUBLISHED_PROBLEM}`,
    );
    expect(detach.status).toBe(400);
    expect(detach.body.details).toEqual([
      expect.objectContaining({ code: 'PUBLISHED_CONTENT_REQUIRED' }),
    ]);

    // Xoá mềm và khôi phục Course đã xuất bản.
    expect((await call('DELETE', `/api/courses/${id}`)).status).toBe(204);
    expect((await call('GET', `/api/courses/${slug}`, { headers: student })).status).toBe(404);
    const restored = await call('POST', `/api/courses/${id}/restore`);
    expect(restored.body).toMatchObject({ status: 'PUBLISHED', deletedAt: null });

    // Course nháp được xoá hẳn theo LRN-008.
    const draft = await call('POST', '/api/courses', {
      body: { slug: `${slug}-draft`, title: 'Draft' },
    });
    const draftId = draft.body.id as string;
    expect((await call('DELETE', `/api/courses/${draftId}`)).status).toBe(204);
    expect((await call('GET', `/api/courses/managed/${draftId}`)).status).toBe(404);
  });
});
