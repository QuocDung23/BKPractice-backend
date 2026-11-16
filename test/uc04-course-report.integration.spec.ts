import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { RabbitMqService } from '@app/common';
import { Global, type INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { identityEntities } from '../apps/identity-service/src/modules/identity.entities';
import { UserManagementUseCases } from '../apps/identity-service/src/modules/users/application';
import { TypeormUserManagementRepository } from '../apps/identity-service/src/modules/users/infrastructure/persistence';
import { StudentRosterController } from '../apps/identity-service/src/modules/users/presentation/student-roster.controller';
import { CoursesModule } from '../apps/learning-service/src/modules/courses/courses.module';
import {
  assertTestDatabase,
  learningDataSourceOptions,
  TEST_DATABASE_URL,
  upsertProblem,
} from '../apps/learning-service/src/modules/courses/testing';
import { ApplyAcceptedSubmissionUseCase } from '../apps/learning-service/src/modules/progress/application/use-cases';
import { ProgressModule } from '../apps/learning-service/src/modules/progress/progress.module';
import {
  CountCourseSubmissionsUseCase,
  SUBMISSION_COUNT_READER,
} from '../apps/submission-service/src/modules/submissions/application/count-course-submissions.use-case';
import { TypeormSubmissionCountReader } from '../apps/submission-service/src/modules/submissions/infrastructure/persistence/typeorm-submission-count.reader';
import { InternalSubmissionCountsController } from '../apps/submission-service/src/modules/submissions/presentation/internal-submission-counts.controller';

/**
 * UC04 - bao cao tien do theo Course cua Giang vien (LRN-009), dau-cuoi qua 3 service that:
 * Learning (DB that + migration), Identity (controller noi bo + repository that + DB identity),
 * Submission (controller noi bo + reader that + DB submission). Chi co RabbitMQ la stub.
 * Env: TEST_DATABASE_URL (learning), UC04_IDENTITY_TEST_DATABASE_URL, UC04_SUBMISSION_TEST_DATABASE_URL;
 * ten DB phai ket thuc bang `_test`.
 */
const IDENTITY_URL = process.env.UC04_IDENTITY_TEST_DATABASE_URL;
const SUBMISSION_URL = process.env.UC04_SUBMISSION_TEST_DATABASE_URL;
const isTestDb = (url?: string): boolean => !!url && new URL(url).pathname.endsWith('_test');
assertTestDatabase();
const enabled = !!TEST_DATABASE_URL && isTestDb(IDENTITY_URL) && isTestDb(SUBMISSION_URL);
const describeE2e = enabled ? describe : describe.skip;

const SECRET = 'uc04-internal-secret';
const PERMISSION = 'course:read-managed';

@Global()
@Module({
  providers: [
    { provide: RabbitMqService, useValue: { consume: jest.fn().mockResolvedValue(undefined) } },
  ],
  exports: [RabbitMqService],
})
class StubMessagingModule {}

interface ReportItem {
  userId: string;
  studentId: string | null;
  displayName: string | null;
  submissionCount: number;
  completed: number;
  total: number;
  status: string;
  chapters: Array<{ chapterId: string; completed: number; total: number }>;
}
interface Report {
  items: ReportItem[];
  page: number;
  limit: number;
  hasMore: boolean;
  courseId: string;
}

describeE2e('UC04 course report end-to-end (Learning + Identity + Submission)', () => {
  let learning: INestApplication;
  let identityApp: INestApplication;
  let submissionApp: INestApplication;
  let learningUrl: string;
  let identityUrl: string;
  let submissionUrl: string;
  let learningDb: DataSource;
  let identityDb: DataSource;
  let submissionDb: DataSource;
  let config: ConfigService;
  let chaos: Server;
  let chaosUrl: string;
  let chaosHandler: (path: string) => { status: number; body: unknown };
  let apply: ApplyAcceptedSubmissionUseCase;

  const lecturer = randomUUID();
  const otherLecturer = randomUUID();
  const admin = randomUUID();
  const P = [1, 2, 3, 4, 5].map(() => randomUUID()); // P[2] bi an, P[4] bi go khoi Course
  const CH1 = randomUUID();
  const CH2 = randomUUID();
  const COURSE = randomUUID();
  const COURSE_EMPTY = randomUUID();
  const COURSE_HIDDEN = randomUUID();
  const COURSE_DRAFT = randomUUID();
  const COURSE_DELETED = randomUUID();
  const COURSE_BIG = randomUUID();
  const S: string[] = [];
  let bigProblems: string[] = [];

  const hdr = (userId: string, roles: string, permissions: string | undefined = PERMISSION) => ({
    'x-auth-user-id': userId,
    'x-auth-roles': roles,
    ...(permissions ? { 'x-auth-permissions': permissions } : {}),
  });
  const owner = () => hdr(lecturer, 'LECTURER');
  const call = (path: string, headers: Record<string, string> = owner()) =>
    fetch(`${learningUrl}${path}`, { headers });
  const report = async (courseId = COURSE, query = '', headers = owner()): Promise<Report> => {
    const response = await call(`/api/progress/courses/${courseId}/students${query}`, headers);
    expect(response.status).toBe(200);
    return (await response.json()) as Report;
  };
  const byStudentId = (items: ReportItem[], studentId: string | null) =>
    items.find((item) => item.studentId === studentId)!;
  const withHttpApp = async (module: Parameters<typeof Test.createTestingModule>[0]) => {
    const app = (await Test.createTestingModule(module).compile()).createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.listen(0, '127.0.0.1');
    return app;
  };
  const urlOf = (app: INestApplication) =>
    `http://127.0.0.1:${((app.getHttpServer() as Server).address() as AddressInfo).port}`;

  async function createStudent(
    index: number,
    studentId: string | null,
    status: 'ACTIVE' | 'LOCKED' | 'PENDING' = 'ACTIVE',
    deleted = false,
  ): Promise<string> {
    const id = randomUUID();
    await identityDb.query(
      `INSERT INTO users (id, email, password_hash, display_name, student_id, status)
       VALUES ($1, $2, 'hash', $3, $4, $5)`,
      [id, `uc04-${id}@uc04.test`, `Sinh vien ${index}`, studentId, status],
    );
    await identityDb.query(
      `INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = 'STUDENT'`,
      [id],
    );
    if (deleted) await identityDb.query('UPDATE users SET deleted_at = now() WHERE id = $1', [id]);
    return id;
  }
  const submit = (
    userId: string,
    problemId: string,
    kind: 'SUBMIT' | 'RUN',
    status: string,
    times = 1,
  ) =>
    Promise.all(
      Array.from({ length: times }, () =>
        submissionDb.query(
          `INSERT INTO submissions (user_id, problem_id, kind, language, source_code, status)
           VALUES ($1, $2, $3, 'cpp', 'int main(){}', $4)`,
          [userId, problemId, kind, status],
        ),
      ),
    );
  const solve = (userId: string, problemId: string) =>
    apply.execute({
      eventId: randomUUID(),
      submissionId: randomUUID(),
      userId,
      problemId,
      occurredAt: '2026-03-01T00:00:00Z',
      score: 100,
    });
  const setStatus = (problemId: string, status: 'PUBLISHED' | 'ON_HOLD') =>
    learningDb.query(
      `UPDATE problems SET publish_status = $2::problems_publish_status_enum WHERE id = $1`,
      [problemId, status],
    );

  beforeAll(async () => {
    identityDb = new DataSource({
      type: 'postgres',
      url: IDENTITY_URL,
      entities: identityEntities,
      migrations: ['apps/identity-service/src/database/migrations/*{.ts,.js}'],
      synchronize: false,
    });
    await identityDb.initialize();
    await identityDb.runMigrations();
    await identityDb.query(`DELETE FROM users WHERE email LIKE '%@uc04.test'`);
    submissionDb = new DataSource({
      type: 'postgres',
      url: SUBMISSION_URL,
      migrations: ['apps/submission-service/src/database/migrations/*{.ts,.js}'],
      synchronize: false,
    });
    await submissionDb.initialize();
    await submissionDb.runMigrations();

    identityApp = await withHttpApp({
      controllers: [StudentRosterController],
      providers: [
        {
          provide: UserManagementUseCases,
          useFactory: () =>
            new UserManagementUseCases(
              new TypeormUserManagementRepository(identityDb),
              {} as never,
            ),
        },
        {
          provide: ConfigService,
          useValue: new ConfigService({ INTERNAL_SERVICE_SECRET: SECRET }),
        },
      ],
    });
    identityUrl = urlOf(identityApp);
    submissionApp = await withHttpApp({
      controllers: [InternalSubmissionCountsController],
      providers: [
        CountCourseSubmissionsUseCase,
        {
          provide: SUBMISSION_COUNT_READER,
          useValue: new TypeormSubmissionCountReader(submissionDb),
        },
        {
          provide: ConfigService,
          useValue: new ConfigService({ INTERNAL_SERVICE_SECRET: SECRET }),
        },
      ],
    });
    submissionUrl = urlOf(submissionApp);
    chaosHandler = () => ({ status: 500, body: {} });
    chaos = createServer((request, response) => {
      const result = chaosHandler(request.url ?? '');
      response.writeHead(result.status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(result.body));
    });
    await new Promise<void>((resolve) => chaos.listen(0, '127.0.0.1', resolve));
    chaosUrl = `http://127.0.0.1:${(chaos.address() as AddressInfo).port}`;

    learning = await withHttpApp({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              INTERNAL_SERVICE_SECRET: SECRET,
              IDENTITY_SERVICE_URL: identityUrl,
              SUBMISSION_SERVICE_URL: submissionUrl,
            }),
          ],
        }),
        TypeOrmModule.forRoot({
          ...learningDataSourceOptions({ extra: { max: 2, connectionTimeoutMillis: 1500 } }),
          migrationsRun: true,
        }),
        StubMessagingModule,
        ProgressModule,
        CoursesModule,
      ],
    });
    learningUrl = urlOf(learning);
    learningDb = learning.get(DataSource);
    config = learning.get(ConfigService);
    apply = learning.get(ApplyAcceptedSubmissionUseCase);

    // Identity: 001..005 (ACTIVE, ACTIVE, ACTIVE, PENDING, LOCKED), khong studentId (cuoi), 1 da xoa mem
    S.push(await createStudent(1, '001'));
    S.push(await createStudent(2, '002'));
    S.push(await createStudent(3, '003'));
    S.push(await createStudent(4, '004', 'PENDING'));
    S.push(await createStudent(5, '005', 'LOCKED'));
    S.push(await createStudent(6, null));
    await createStudent(7, '006', 'ACTIVE', true);

    // Learning: Problem + Course
    for (const [index, id] of P.entries())
      await upsertProblem(learningDb, { id, slug: `uc04-${id}`, title: `UC04 P${index + 1}` });
    const course = (id: string, slug: string, status: string, owner = lecturer) =>
      learningDb.query(
        `INSERT INTO courses (id, slug, title, created_by, status) VALUES ($1, $2, $3, $4, $5)`,
        [id, `uc04-${slug}-${id}`, `Course ${slug}`, owner, status],
      );
    await course(COURSE, 'main', 'PUBLISHED');
    await course(COURSE_EMPTY, 'empty', 'PUBLISHED');
    await course(COURSE_HIDDEN, 'hidden', 'PUBLISHED');
    await course(COURSE_DRAFT, 'draft', 'DRAFT');
    await course(COURSE_DELETED, 'deleted', 'PUBLISHED');
    await course(COURSE_BIG, 'big', 'PUBLISHED');
    await learningDb.query('UPDATE courses SET deleted_at = now() WHERE id = $1', [COURSE_DELETED]);
    for (const [id, order] of [
      [CH1, 0],
      [CH2, 1],
    ] as const)
      await learningDb.query(
        `INSERT INTO chapters (id, course_id, title, display_order) VALUES ($1, $2, 'Chapter', $3)`,
        [id, COURSE, order],
      );
    const attach = async (course: string, chapter: string, problem: string, order: number) => {
      await learningDb.query(
        `INSERT INTO chapter_problems (course_id, chapter_id, problem_id, display_order) VALUES ($1, $2, $3, $4)`,
        [course, chapter, problem, order],
      );
      await learningDb.query(
        `INSERT INTO course_problem_history (course_id, problem_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [course, problem],
      );
    };
    await attach(COURSE, CH1, P[0]!, 0);
    await attach(COURSE, CH1, P[1]!, 1);
    await attach(COURSE, CH1, P[2]!, 2);
    await attach(COURSE, CH2, P[3]!, 0);
    // P[4]: tung thuoc Course nhung da go (chi con trong lich su)
    await learningDb.query(
      `INSERT INTO course_problem_history (course_id, problem_id) VALUES ($1, $2)`,
      [COURSE, P[4]],
    );
    await setStatus(P[2]!, 'ON_HOLD');
    // COURSE_HIDDEN: moi Problem deu an (P[2]) nhung lich su con
    const hiddenChapter = randomUUID();
    await learningDb.query(
      `INSERT INTO chapters (id, course_id, title, display_order) VALUES ($1, $2, 'Hidden', 0)`,
      [hiddenChapter, COURSE_HIDDEN],
    );
    await attach(COURSE_HIDDEN, hiddenChapter, P[2]!, 0);
    // COURSE_DRAFT: 1 Problem dang hien
    const draftChapter = randomUUID();
    await learningDb.query(
      `INSERT INTO chapters (id, course_id, title, display_order) VALUES ($1, $2, 'Draft', 0)`,
      [draftChapter, COURSE_DRAFT],
    );
    await attach(COURSE_DRAFT, draftChapter, P[0]!, 0);
    // COURSE_BIG: 501 Problem trong lich su de ep Learning chia batch 500
    bigProblems = Array.from({ length: 501 }, () => randomUUID());
    for (const id of bigProblems) {
      await upsertProblem(learningDb, { id, slug: `uc04-big-${id}` });
      await learningDb.query(
        `INSERT INTO course_problem_history (course_id, problem_id) VALUES ($1, $2)`,
        [COURSE_BIG, id],
      );
    }

    // Tien do: S1 giai P1,P2,P3(an),P4 ; S2 giai P1
    for (const problem of [P[0]!, P[1]!, P[2]!, P[3]!]) await solve(S[0]!, problem);
    await solve(S[1]!, P[0]!);

    // Submission: S1 P1 x3 (1 PENDING, 1 WRONG_ANSWER, 1 ACCEPTED) + 5 RUN; P2 x1; P3 (an) x2; P5 (da go) x1
    await submit(S[0]!, P[0]!, 'SUBMIT', 'PENDING');
    await submit(S[0]!, P[0]!, 'SUBMIT', 'WRONG_ANSWER');
    await submit(S[0]!, P[0]!, 'SUBMIT', 'ACCEPTED');
    await submit(S[0]!, P[0]!, 'RUN', 'EXECUTED', 5);
    await submit(S[0]!, P[1]!, 'SUBMIT', 'ACCEPTED');
    await submit(S[0]!, P[2]!, 'SUBMIT', 'ACCEPTED', 2);
    await submit(S[0]!, P[4]!, 'SUBMIT', 'WRONG_ANSWER');
    await submit(S[1]!, P[0]!, 'SUBMIT', 'ACCEPTED');
    await submit(S[2]!, P[0]!, 'RUN', 'EXECUTED', 3); // S3 chi chay thu
    await submit(S[0]!, bigProblems[0]!, 'SUBMIT', 'ACCEPTED');
    await submit(S[0]!, bigProblems[500]!, 'SUBMIT', 'WRONG_ANSWER', 2);
  }, 120000);

  afterEach(() => {
    config.set('IDENTITY_SERVICE_URL', identityUrl);
    config.set('SUBMISSION_SERVICE_URL', submissionUrl);
    config.set('INTERNAL_SERVICE_SECRET', SECRET);
  });

  afterAll(async () => {
    await learning?.close();
    await identityApp?.close();
    await submissionApp?.close();
    await new Promise<void>((resolve) => (chaos ? chaos.close(() => resolve()) : resolve()));
    if (identityDb?.isInitialized) {
      await identityDb.query(`DELETE FROM users WHERE email LIKE '%@uc04.test'`);
      await identityDb.destroy();
    }
    if (submissionDb?.isInitialized) await submissionDb.destroy();
  });

  it('UC04-E2E-01 lists every Student (incl. 0 submissions/PENDING/LOCKED), excludes deleted, ordered by studentId with NULL last', async () => {
    const body = await report();
    expect(body).toMatchObject({ page: 1, limit: 20, hasMore: false, courseId: COURSE });
    expect(body.items.map((item) => item.studentId)).toEqual([
      '001',
      '002',
      '003',
      '004',
      '005',
      null,
    ]);
    expect(body.items.map((item) => item.userId)).toEqual(S);
    expect(body.items[0]).toMatchObject({ displayName: 'Sinh vien 1' });
  });

  it('UC04-E2E-02 counts only saved SUBMIT rows (retries, failed verdicts, hidden/removed Problem history) and never RUN', async () => {
    const { items } = await report();
    expect(byStudentId(items, '001').submissionCount).toBe(3 + 1 + 2 + 1);
    expect(byStudentId(items, '002').submissionCount).toBe(1);
    expect(byStudentId(items, '003').submissionCount).toBe(0);
    expect(byStudentId(items, '004').submissionCount).toBe(0);
  });

  it('UC04-E2E-03 computes completed/total/status per Course and per Chapter from visible Problems only', async () => {
    const { items } = await report();
    expect(byStudentId(items, '001')).toMatchObject({
      completed: 3,
      total: 3,
      status: 'Hoàn thành',
      chapters: [
        { chapterId: CH1, completed: 2, total: 2 },
        { chapterId: CH2, completed: 1, total: 1 },
      ],
    });
    expect(byStudentId(items, '002')).toMatchObject({
      completed: 1,
      total: 3,
      status: 'Đang học',
      chapters: [
        { chapterId: CH1, completed: 1, total: 2 },
        { chapterId: CH2, completed: 0, total: 1 },
      ],
    });
    expect(byStudentId(items, '003')).toMatchObject({ completed: 0, total: 3, status: 'Đang học' });
  });

  it('UC04-E2E-04 exposes only the approved fields (no email/password/token/source code)', async () => {
    const response = await call(`/api/progress/courses/${COURSE}/students`);
    const text = await response.text();
    expect(text).not.toMatch(/email|password|token|@uc04\.test|source|int main/i);
    const body = JSON.parse(text) as Report;
    expect(Object.keys(body).sort()).toEqual(['courseId', 'hasMore', 'items', 'limit', 'page']);
    expect(Object.keys(body.items[0]!).sort()).toEqual([
      'chapters',
      'completed',
      'displayName',
      'status',
      'studentId',
      'submissionCount',
      'total',
      'userId',
    ]);
  });

  it('UC04-E2E-05 paginates with stable order and hasMore (limit=2: 3 pages, then an empty page)', async () => {
    const first = await report(COURSE, '?page=1&limit=2');
    expect(first).toMatchObject({ page: 1, limit: 2, hasMore: true });
    expect(first.items.map((item) => item.studentId)).toEqual(['001', '002']);
    const second = await report(COURSE, '?page=2&limit=2');
    expect(second.items.map((item) => item.studentId)).toEqual(['003', '004']);
    expect(second.hasMore).toBe(true);
    const third = await report(COURSE, '?page=3&limit=2');
    expect(third.items.map((item) => item.studentId)).toEqual(['005', null]);
    expect(third.hasMore).toBe(false);
    const beyond = await report(COURSE, '?page=4&limit=2');
    expect(beyond).toMatchObject({ items: [], page: 4, limit: 2, hasMore: false });
    const max = await report(COURSE, '?limit=100');
    expect(max).toMatchObject({ limit: 100, hasMore: false });
    expect(max.items).toHaveLength(6);
  });

  it.each([
    '?page=0',
    '?page=-1',
    '?page=1.5',
    '?page=abc',
    '?limit=0',
    '?limit=101',
    '?limit=abc',
    '?foo=1',
  ])('UC04-E2E-06 rejects invalid query %s with 400', async (query) => {
    expect((await call(`/api/progress/courses/${COURSE}/students${query}`)).status).toBe(400);
  });

  it('UC04-E2E-07 rejects a malformed courseId with 400 and an unknown Course with 404', async () => {
    expect((await call('/api/progress/courses/not-a-uuid/students')).status).toBe(400);
    const missing = await call(`/api/progress/courses/${randomUUID()}/students`);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ statusCode: 404, message: 'Course not found' });
    expect((await call(`/api/progress/courses/${COURSE_DELETED}/students`)).status).toBe(404);
  });

  it('UC04-E2E-08 enforces authentication and role/permission/ownership', async () => {
    const path = `/api/progress/courses/${COURSE}/students`;
    expect((await call(path, {})).status).toBe(401);
    expect((await call(path, { 'x-auth-user-id': 'bad' })).status).toBe(401);
    expect((await call(path, hdr(randomUUID(), 'STUDENT'))).status).toBe(403);
    expect((await call(path, hdr(randomUUID(), 'STUDENT', 'course:read-managed'))).status).toBe(
      403,
    );
    expect((await call(path, hdr(lecturer, 'LECTURER', undefined))).status).toBe(403);
    expect((await call(path, hdr(lecturer, 'LECTURER', 'problem:read-managed'))).status).toBe(403);
    const other = await call(path, hdr(otherLecturer, 'LECTURER'));
    expect(other.status).toBe(403);
    expect(await other.json()).toEqual({ statusCode: 403, message: 'Forbidden' });
    expect((await call(path, owner())).status).toBe(200);
  });

  it('UC04-E2E-09 lets ADMIN read any Course and lets the owner read own DRAFT Course', async () => {
    const adminBody = await report(COURSE, '', hdr(admin, 'ADMIN'));
    expect(adminBody.items).toHaveLength(6);
    const draft = await report(COURSE_DRAFT);
    expect(byStudentId(draft.items, '001')).toMatchObject({ completed: 1, total: 1 });
    expect(
      (await call(`/api/progress/courses/${COURSE_DRAFT}/students`, hdr(otherLecturer, 'LECTURER')))
        .status,
    ).toBe(403);
  });

  it('UC04-E2E-10 returns 0/0 "Chưa có bài tập" for a Course without Problems and keeps all Students', async () => {
    const empty = await report(COURSE_EMPTY);
    expect(empty.items).toHaveLength(6);
    expect(empty.items.every((item) => item.status === 'Chưa có bài tập')).toBe(true);
    expect(empty.items.every((item) => item.total === 0 && item.completed === 0)).toBe(true);
    expect(empty.items.every((item) => item.chapters.length === 0)).toBe(true);
    expect(empty.items.every((item) => item.submissionCount === 0)).toBe(true);
  });

  it('UC04-E2E-11 keeps old submission counts while every Problem is hidden (0/0 "Chưa có bài tập")', async () => {
    const { items } = await report(COURSE_HIDDEN);
    expect(byStudentId(items, '001')).toMatchObject({
      submissionCount: 2,
      completed: 0,
      total: 0,
      status: 'Chưa có bài tập',
      chapters: [{ completed: 0, total: 0 }],
    });
  });

  it('UC04-E2E-12 recalculates when a Problem is hidden then shown again, keeping submission counts', async () => {
    await setStatus(P[1]!, 'ON_HOLD');
    try {
      const hidden = byStudentId((await report()).items, '001');
      expect(hidden).toMatchObject({
        completed: 2,
        total: 2,
        status: 'Hoàn thành',
        submissionCount: 7,
      });
    } finally {
      await setStatus(P[1]!, 'PUBLISHED');
    }
    const shown = byStudentId((await report()).items, '001');
    expect(shown).toMatchObject({ completed: 3, total: 3, submissionCount: 7 });
    expect(byStudentId((await report()).items, '002')).toMatchObject({ completed: 1, total: 3 });
    // P[2] van an -> khong tinh vao tu/mau; hien lai thi tien do cu duoc dung lai
    await setStatus(P[2]!, 'PUBLISHED');
    try {
      expect(byStudentId((await report()).items, '001')).toMatchObject({ completed: 4, total: 4 });
    } finally {
      await setStatus(P[2]!, 'ON_HOLD');
    }
  });

  it('UC04-E2E-13 ignores Problem soft-deleted from the Course structure but still counts its old SUBMIT rows', async () => {
    await learningDb.query('UPDATE problems SET deleted_at = now() WHERE id = $1', [P[3]]);
    try {
      expect(byStudentId((await report()).items, '001')).toMatchObject({
        completed: 2,
        total: 2,
        submissionCount: 7,
      });
    } finally {
      await learningDb.query('UPDATE problems SET deleted_at = NULL WHERE id = $1', [P[3]]);
    }
  });

  it('UC04-E2E-14 splits >500 Problem ids across batches without losing counts', async () => {
    const { items } = await report(COURSE_BIG);
    expect(byStudentId(items, '001').submissionCount).toBe(3);
    expect(byStudentId(items, '001')).toMatchObject({ total: 0, status: 'Chưa có bài tập' });
  });

  it('UC04-E2E-15 is read-only: no progress/receipt row is changed by the report', async () => {
    const count = async () =>
      learningDb.query<Array<{ progress: string; receipts: string }>>(
        `SELECT (SELECT count(*) FROM progress) AS progress, (SELECT count(*) FROM progress_event_receipts) AS receipts`,
      );
    const before = await count();
    await report();
    await report(COURSE, '?page=2&limit=2');
    expect(await count()).toEqual(before);
  });

  it('UC04-E2E-16 returns a safe 503 (never zeros) when Identity is unreachable, fails or sends a malformed payload', async () => {
    config.set('IDENTITY_SERVICE_URL', 'http://127.0.0.1:1');
    let response = await call(`/api/progress/courses/${COURSE}/students`);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      statusCode: 503,
      message: 'Report dependency unavailable',
    });
    config.set('IDENTITY_SERVICE_URL', chaosUrl);
    chaosHandler = () => ({ status: 500, body: { message: 'secret stack trace' } });
    response = await call(`/api/progress/courses/${COURSE}/students`);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('secret stack trace');
    chaosHandler = () => ({
      status: 200,
      body: {
        items: [{ userId: 'not-uuid', studentId: null, displayName: null }],
        page: 1,
        limit: 20,
        hasMore: false,
      },
    });
    expect((await call(`/api/progress/courses/${COURSE}/students`)).status).toBe(503);
    chaosHandler = () => ({
      status: 200,
      body: { items: [], page: 9, limit: 20, hasMore: false },
    });
    expect((await call(`/api/progress/courses/${COURSE}/students`)).status).toBe(503);
  });

  it('UC04-E2E-17 returns a safe 503 when Submission fails, rejects foreign rows or has the wrong internal secret', async () => {
    config.set('SUBMISSION_SERVICE_URL', 'http://127.0.0.1:1');
    expect((await call(`/api/progress/courses/${COURSE}/students`)).status).toBe(503);
    config.set('SUBMISSION_SERVICE_URL', chaosUrl);
    chaosHandler = () => ({ status: 500, body: {} });
    expect((await call(`/api/progress/courses/${COURSE}/students`)).status).toBe(503);
    chaosHandler = () => ({
      status: 200,
      body: { counts: [{ userId: randomUUID(), problemId: P[0], count: 5 }] },
    });
    expect((await call(`/api/progress/courses/${COURSE}/students`)).status).toBe(503);
    chaosHandler = () => ({ status: 200, body: { counts: 'oops' } });
    expect((await call(`/api/progress/courses/${COURSE}/students`)).status).toBe(503);
    config.set('SUBMISSION_SERVICE_URL', submissionUrl);
    config.set('INTERNAL_SERVICE_SECRET', 'wrong-secret');
    expect((await call(`/api/progress/courses/${COURSE}/students`)).status).toBe(503);
  });

  it('UC04-E2E-18 Identity internal roster: secret required, minimal projection, validated pagination', async () => {
    const path = `${identityUrl}/internal/users/students`;
    expect((await fetch(path)).status).toBe(401);
    expect((await fetch(path, { headers: { 'x-internal-service-secret': 'wrong' } })).status).toBe(
      401,
    );
    const ok = await fetch(`${path}?page=1&limit=2`, {
      headers: { 'x-internal-service-secret': SECRET },
    });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { items: Array<Record<string, unknown>>; hasMore: boolean };
    expect(body.hasMore).toBe(true);
    expect(Object.keys(body.items[0]!).sort()).toEqual(['displayName', 'studentId', 'userId']);
    for (const query of ['?page=0', '?limit=0', '?limit=101', '?page=abc', '?foo=1'])
      expect(
        (await fetch(`${path}${query}`, { headers: { 'x-internal-service-secret': SECRET } }))
          .status,
      ).toBe(400);
  });

  it('UC04-E2E-19 Submission internal counts: secret required, array limits and unique UUIDs enforced, SUBMIT only', async () => {
    const post = (secret: string | undefined, body: unknown) =>
      fetch(`${submissionUrl}/internal/submissions/counts`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(secret ? { 'x-internal-service-secret': secret } : {}),
        },
        body: JSON.stringify(body),
      });
    const valid = { userIds: [S[0]], problemIds: [P[0]] };
    expect((await post(undefined, valid)).status).toBe(401);
    expect((await post('wrong', valid)).status).toBe(401);
    const ok = await post(SECRET, valid);
    expect(ok.status).toBe(201);
    expect(await ok.json()).toEqual({ counts: [{ userId: S[0], problemId: P[0], count: 3 }] });
    const ids = (n: number) => Array.from({ length: n }, () => randomUUID());
    expect((await post(SECRET, { userIds: ids(101), problemIds: [P[0]] })).status).toBe(400);
    expect((await post(SECRET, { userIds: [S[0]], problemIds: ids(501) })).status).toBe(400);
    expect((await post(SECRET, { userIds: [S[0], S[0]], problemIds: [P[0]] })).status).toBe(400);
    expect((await post(SECRET, { userIds: ['x'], problemIds: [P[0]] })).status).toBe(400);
    expect((await post(SECRET, { userIds: [S[0]] })).status).toBe(400);
    expect(await (await post(SECRET, { userIds: [], problemIds: [P[0]] })).json()).toEqual({
      counts: [],
    });
  });
});
