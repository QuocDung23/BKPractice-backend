import type { AddressInfo } from 'node:net';

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
    expect(detach.body.issues).toEqual(['PUBLISHED_CONTENT_REQUIRED']);

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
