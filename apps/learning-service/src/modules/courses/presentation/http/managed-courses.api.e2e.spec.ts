import type { AddressInfo } from 'node:net';

import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';

import {
  ADD_CHAPTER_PORT_IN,
  ATTACH_PROBLEM_PORT_IN,
  CREATE_COURSE_PORT_IN,
  DELETE_COURSE_PORT_IN,
  DETACH_PROBLEM_PORT_IN,
  GET_MANAGED_COURSE_PORT_IN,
  GET_PUBLISHED_COURSE_PORT_IN,
  HOLD_COURSE_PORT_IN,
  LIST_MANAGED_COURSES_PORT_IN,
  LIST_PUBLISHED_COURSES_PORT_IN,
  PUBLISH_COURSE_PORT_IN,
  REMOVE_CHAPTER_PORT_IN,
  REORDER_CHAPTER_PROBLEMS_PORT_IN,
  REORDER_CHAPTERS_PORT_IN,
  REPUBLISH_COURSE_PORT_IN,
  RESTORE_COURSE_PORT_IN,
  UPDATE_CHAPTER_PORT_IN,
  UPDATE_COURSE_PORT_IN,
} from '@/modules/courses/application/ports/in';
import { COURSE_QUIZ_CATALOG } from '@/modules/courses/application/ports/out';
import {
  CourseAuthorizationService,
  CoursePublishReadinessService,
  CourseViewAssembler,
} from '@/modules/courses/application/services';
import {
  AddChapterUseCase,
  RemoveChapterUseCase,
  ReorderChaptersUseCase,
  UpdateChapterUseCase,
  DeleteCourseUseCase,
  HoldCourseUseCase,
  PublishCourseUseCase,
  RepublishCourseUseCase,
  RestoreCourseUseCase,
  CreateCourseUseCase,
  AttachProblemUseCase,
  DetachProblemUseCase,
  ReorderChapterProblemsUseCase,
  GetManagedCourseUseCase,
  GetPublishedCourseUseCase,
  ListManagedCoursesUseCase,
  ListPublishedCoursesUseCase,
  UpdateCourseUseCase,
} from '@/modules/courses/application/use-cases';
import {
  COURSE_PROBLEM_CATALOG,
  COURSE_REPOSITORY,
  COURSE_TRANSACTION_RUNNER,
} from '@/modules/courses/course.tokens';
import { CourseReadiness } from '@/modules/courses/domain/services';
import { ManagedChaptersController } from '@/modules/courses/presentation/http/managed-chapters.controller';
import { ManagedCoursesController } from '@/modules/courses/presentation/http/managed-courses.controller';
import { PublicCoursesController } from '@/modules/courses/presentation/http/public-courses.controller';
import { courseWithProblem } from '@/modules/courses/testing';
import {
  ALL_COURSE_PERMISSIONS,
  FakeProblemCatalog,
  FakeQuizCatalog,
  InlineTransactionRunner,
  InMemoryCourseRepository,
  OTHER_ID,
  OWNER_ID,
  PROBLEM_ID,
} from '@/modules/courses/testing';

interface ApiResponse {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

type Headers = Record<string, string>;

const SECOND_PROBLEM = '00000000-0000-4000-8000-0000000000d4';

const MISSING_ID = '00000000-0000-4000-8000-0000000000ff';

function headers(
  userId = OWNER_ID,
  roles = 'ADMIN',
  permissions = ALL_COURSE_PERMISSIONS.join(','),
): Headers {
  return {
    'content-type': 'application/json',
    'x-auth-user-id': userId,
    'x-auth-roles': roles,
    'x-auth-permissions': permissions,
  };
}

/** Sinh viên: có định danh và vai trò, không có header quyền (như module problems). */
function studentHeaders(): Headers {
  return {
    'content-type': 'application/json',
    'x-auth-user-id': OTHER_ID,
    'x-auth-roles': 'STUDENT',
  };
}

const asList = (value: unknown): Array<Record<string, unknown>> =>
  value as Array<Record<string, unknown>>;

describe('Courses API (18 routes of the LRN-003 plan)', () => {
  let app: NestExpressApplication;
  let baseUrl: string;
  let repository: InMemoryCourseRepository;
  let catalog: FakeProblemCatalog;
  let quizCatalog: FakeQuizCatalog;

  beforeAll(async () => {
    repository = new InMemoryCourseRepository();
    catalog = new FakeProblemCatalog();
    quizCatalog = new FakeQuizCatalog();
    const moduleRef = await Test.createTestingModule({
      controllers: [ManagedCoursesController, ManagedChaptersController, PublicCoursesController],
      providers: [
        CourseAuthorizationService,
        CourseReadiness,
        CoursePublishReadinessService,
        CourseViewAssembler,

        CreateCourseUseCase,
        UpdateCourseUseCase,
        PublishCourseUseCase,
        HoldCourseUseCase,
        RepublishCourseUseCase,
        DeleteCourseUseCase,
        RestoreCourseUseCase,
        AddChapterUseCase,
        UpdateChapterUseCase,
        RemoveChapterUseCase,
        ReorderChaptersUseCase,
        AttachProblemUseCase,
        DetachProblemUseCase,
        ReorderChapterProblemsUseCase,
        GetManagedCourseUseCase,
        ListManagedCoursesUseCase,
        GetPublishedCourseUseCase,
        ListPublishedCoursesUseCase,
        { provide: COURSE_REPOSITORY, useValue: repository },
        { provide: COURSE_PROBLEM_CATALOG, useValue: catalog },
        { provide: COURSE_QUIZ_CATALOG, useValue: quizCatalog },
        { provide: COURSE_TRANSACTION_RUNNER, useValue: new InlineTransactionRunner() },
        { provide: CREATE_COURSE_PORT_IN, useExisting: CreateCourseUseCase },
        { provide: UPDATE_COURSE_PORT_IN, useExisting: UpdateCourseUseCase },
        { provide: PUBLISH_COURSE_PORT_IN, useExisting: PublishCourseUseCase },
        { provide: HOLD_COURSE_PORT_IN, useExisting: HoldCourseUseCase },
        { provide: REPUBLISH_COURSE_PORT_IN, useExisting: RepublishCourseUseCase },
        { provide: DELETE_COURSE_PORT_IN, useExisting: DeleteCourseUseCase },
        { provide: RESTORE_COURSE_PORT_IN, useExisting: RestoreCourseUseCase },
        { provide: ADD_CHAPTER_PORT_IN, useExisting: AddChapterUseCase },
        { provide: UPDATE_CHAPTER_PORT_IN, useExisting: UpdateChapterUseCase },
        { provide: REMOVE_CHAPTER_PORT_IN, useExisting: RemoveChapterUseCase },
        { provide: REORDER_CHAPTERS_PORT_IN, useExisting: ReorderChaptersUseCase },
        { provide: ATTACH_PROBLEM_PORT_IN, useExisting: AttachProblemUseCase },
        { provide: DETACH_PROBLEM_PORT_IN, useExisting: DetachProblemUseCase },
        { provide: REORDER_CHAPTER_PROBLEMS_PORT_IN, useExisting: ReorderChapterProblemsUseCase },
        { provide: GET_MANAGED_COURSE_PORT_IN, useExisting: GetManagedCourseUseCase },
        { provide: LIST_MANAGED_COURSES_PORT_IN, useExisting: ListManagedCoursesUseCase },
        { provide: GET_PUBLISHED_COURSE_PORT_IN, useExisting: GetPublishedCourseUseCase },
        { provide: LIST_PUBLISHED_COURSES_PORT_IN, useExisting: ListPublishedCoursesUseCase },
      ],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.listen(0, '127.0.0.1');
    const address = (app.getHttpServer() as { address(): AddressInfo | string | null }).address();
    if (address === null || typeof address === 'string') throw new Error('Expected a TCP port');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    repository.store.clear();
    repository.saveCount = 0;
    repository.hardDeleted = [];
    catalog.problems.clear();
    quizCatalog.quizzes.clear();
    catalog.setProblem(PROBLEM_ID, { title: 'Hello World', slug: 'hello-world' });
  });

  async function call(
    method: string,
    path: string,
    options: { headers?: Headers; body?: unknown } = {},
  ): Promise<ApiResponse> {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: options.headers ?? headers(),
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const text = await response.text();
    return {
      status: response.status,
      body: text.length > 0 ? (JSON.parse(text) as Record<string, unknown>) : {},
    };
  }

  async function createCourse(slug = 'intro-c'): Promise<string> {
    const res = await call('POST', '/api/courses', { body: { slug, title: 'Intro C' } });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  async function addChapter(courseId: string, title = 'Chapter 1'): Promise<string> {
    const res = await call('POST', `/api/courses/${courseId}/chapters`, { body: { title } });
    expect(res.status).toBe(201);
    return asList(res.body.chapters).at(-1)!.id as string;
  }

  async function attach(courseId: string, chapterId: string, problemId = PROBLEM_ID) {
    return call('POST', `/api/courses/${courseId}/chapters/${chapterId}/problems`, {
      body: { problemId },
    });
  }

  /** Course DRAFT có một Chapter và một Problem PUBLISHED, sẵn sàng xuất bản. */
  async function readyCourse(slug = 'intro-c'): Promise<{ id: string; chapterId: string }> {
    const id = await createCourse(slug);
    const chapterId = await addChapter(id);
    expect((await attach(id, chapterId)).status).toBe(201);
    return { id, chapterId };
  }

  it('lets a Lecturer manage own Course, hides it from another Lecturer, and lets Admin manage all', async () => {
    const lecturerA = headers(OWNER_ID, 'LECTURER');
    const lecturerB = headers(OTHER_ID, 'LECTURER');
    const created = await call('POST', '/api/courses', {
      headers: lecturerA,
      body: { slug: 'lecturer-course', title: 'Lecturer Course' },
    });
    expect(created.status).toBe(201);
    const courseId = created.body.id as string;
    expect((await call('GET', '/api/courses/managed', { headers: lecturerA })).body.total).toBe(1);
    expect((await call('GET', '/api/courses/managed', { headers: lecturerB })).body.total).toBe(0);
    expect(
      (await call('GET', `/api/courses/managed/${courseId}`, { headers: lecturerB })).status,
    ).toBe(403);
    expect(
      (
        await call('PATCH', `/api/courses/${courseId}`, {
          headers: lecturerB,
          body: { title: 'Forbidden edit' },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call('PATCH', `/api/courses/${courseId}`, {
          headers: headers(OTHER_ID),
          body: { title: 'Admin edit' },
        })
      ).status,
    ).toBe(200);
  });

  it('lets a Lecturer attach own Problem and rejects another Lecturer Problem without revealing it', async () => {
    const lecturer = headers(OWNER_ID, 'LECTURER');
    const created = await call('POST', '/api/courses', {
      headers: lecturer,
      body: { slug: 'lecturer-attach', title: 'Lecturer Attach' },
    });
    expect(created.status).toBe(201);
    const courseId = created.body.id as string;
    const chapter = await call('POST', `/api/courses/${courseId}/chapters`, {
      headers: lecturer,
      body: { title: 'Chapter' },
    });
    expect(chapter.status).toBe(201);
    const chapterId = asList(chapter.body.chapters).at(-1)!.id as string;
    expect(
      (
        await call('POST', `/api/courses/${courseId}/chapters/${chapterId}/problems`, {
          headers: lecturer,
          body: { problemId: PROBLEM_ID },
        })
      ).status,
    ).toBe(201);
    catalog.setProblem(SECOND_PROBLEM, { createdBy: OTHER_ID });
    const denied = await call('POST', `/api/courses/${courseId}/chapters/${chapterId}/problems`, {
      headers: lecturer,
      body: { problemId: SECOND_PROBLEM },
    });
    expect(denied.status).toBe(400);
  });

  it.each(['managed', 'Managed', 'MANAGED', ' managed '])(
    'rejects reserved slug %s without persisting a course',
    async (slug) => {
      const response = await call('POST', '/api/courses', { body: { slug, title: 'Reserved' } });
      expect(response.status).toBe(400);
      expect(repository.store.size).toBe(0);
      expect(repository.saveCount).toBe(0);
    },
  );

  it('still serves a historical course with a reserved slug by id', async () => {
    const course = courseWithProblem(PROBLEM_ID, 'managed');
    course.publish();
    repository.store.set(course.id.value, course);
    const response = await call('GET', `/api/courses/${course.id.value}`, {
      headers: studentHeaders(),
    });
    expect(response.status).toBe(200);
    expect(response.body.slug).toBe('managed');
    expect((await call('GET', '/api/courses/managed', { headers: studentHeaders() })).status).toBe(
      403,
    );
  });

  describe('status codes and shapes per route', () => {
    it('follows the plan table for every route', async () => {
      const { id, chapterId } = await readyCourse();
      catalog.setProblem(SECOND_PROBLEM);
      const second = await addChapter(id, 'Chapter 2');

      // đọc
      expect((await call('GET', '/api/courses')).status).toBe(200);
      expect((await call('GET', '/api/courses/managed')).status).toBe(200);
      expect((await call('GET', `/api/courses/managed/${id}`)).status).toBe(200);
      // sửa
      expect((await call('PATCH', `/api/courses/${id}`, { body: { title: 'New' } })).status).toBe(
        200,
      );
      expect(
        (await call('PATCH', `/api/courses/${id}/chapters/${chapterId}`, { body: { title: 'Ch' } }))
          .status,
      ).toBe(200);
      expect(
        (
          await call('PUT', `/api/courses/${id}/chapters/order`, {
            body: { ids: [second, chapterId] },
          })
        ).status,
      ).toBe(200);
      expect((await attach(id, second, SECOND_PROBLEM)).status).toBe(201);
      expect(
        (
          await call('PUT', `/api/courses/${id}/chapters/${second}/problems/order`, {
            body: { ids: [SECOND_PROBLEM] },
          })
        ).status,
      ).toBe(200);
      expect(
        (await call('DELETE', `/api/courses/${id}/chapters/${second}/problems/${SECOND_PROBLEM}`))
          .status,
      ).toBe(204);
      expect((await call('DELETE', `/api/courses/${id}/chapters/${second}`)).status).toBe(204);
      // vòng đời
      expect((await call('POST', `/api/courses/${id}/publish`)).status).toBe(200);
      expect((await call('GET', `/api/courses/${id}`)).status).toBe(200);
      expect((await call('POST', `/api/courses/${id}/hold`)).status).toBe(200);
      expect((await call('POST', `/api/courses/${id}/republish`)).status).toBe(200);
      expect((await call('DELETE', `/api/courses/${id}`)).status).toBe(204);
      expect((await call('POST', `/api/courses/${id}/restore`)).status).toBe(200);
    });

    it('does not expose the removed /hard and /preview routes', async () => {
      const id = await createCourse();

      expect((await call('DELETE', `/api/courses/${id}/hard`)).status).toBe(404);
      expect((await call('POST', `/api/courses/${id}/preview`)).status).toBe(404);
    });

    it("accepts the gateway's empty permissions header without a 401", async () => {
      const { id } = await readyCourse();
      expect((await call('POST', `/api/courses/${id}/publish`)).status).toBe(200);
      const legacyTokenHeaders = { ...headers(), 'x-auth-permissions': '' };

      expect((await call('GET', '/api/courses', { headers: legacyTokenHeaders })).status).toBe(200);
      expect(
        (await call('GET', `/api/courses/${id}`, { headers: legacyTokenHeaders })).status,
      ).toBe(200);
      expect(
        (await call('GET', '/api/courses/managed', { headers: legacyTokenHeaders })).status,
      ).toBe(403);
    });

    it('returns the managed view with problem states and readiness', async () => {
      const { id } = await readyCourse();
      catalog.setProblem(PROBLEM_ID, { publishStatus: 'ON_HOLD' });

      const res = await call('GET', `/api/courses/managed/${id}`);

      expect(res.body).toMatchObject({
        status: 'DRAFT',
        createdBy: OWNER_ID,
        deletedAt: null,
        readiness: { ready: false, issues: ['PUBLISHED_CONTENT_REQUIRED'] },
      });
      expect(asList(asList(res.body.chapters)[0]!.problems)[0]).toMatchObject({
        problemId: PROBLEM_ID,
        publishStatus: 'ON_HOLD',
        isDeleted: false,
      });
    });

    it('lists with page/pageSize/q and reports pageSize', async () => {
      await createCourse('alpha');
      await createCourse('beta');

      const res = await call('GET', '/api/courses/managed?page=1&pageSize=1&q=intro');

      expect(res.body).toMatchObject({ total: 2, page: 1, pageSize: 1 });
      expect(asList(res.body.items)).toHaveLength(1);
      expect((await call('GET', '/api/courses/managed?q=zzz')).body.total).toBe(0);
    });

    it('inserts chapters and problems at a given position', async () => {
      const { id, chapterId } = await readyCourse();
      const first = await call('POST', `/api/courses/${id}/chapters`, {
        body: { title: 'Zero', position: 0 },
      });
      expect(asList(first.body.chapters).map((c) => c.title)).toEqual(['Zero', 'Chapter 1']);
      catalog.setProblem(SECOND_PROBLEM);

      const res = await call('POST', `/api/courses/${id}/chapters/${chapterId}/problems`, {
        body: { problemId: SECOND_PROBLEM, position: 0 },
      });

      expect(asList(asList(res.body.chapters)[1]!.problems).map((p) => p.problemId)).toEqual([
        SECOND_PROBLEM,
        PROBLEM_ID,
      ]);
    });
  });

  describe('Swagger (T024)', () => {
    it('documents all 18 operations with Bearer auth and the error responses', () => {
      const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().addBearerAuth().build(),
      );
      const operations = Object.entries(document.paths).flatMap(([path, item]) =>
        Object.entries(item as Record<string, Record<string, unknown>>)
          .filter(([method]) => ['get', 'post', 'put', 'patch', 'delete'].includes(method))
          .map(([method, operation]) => ({ path, method, operation })),
      );

      expect(operations).toHaveLength(18);
      for (const { operation } of operations) {
        expect(operation.summary).toEqual(expect.any(String));
        expect(operation.security).toEqual([{ bearer: [] }]);
        expect(Object.keys(operation.responses as object)).toEqual(
          expect.arrayContaining(['400', '401', '403', '404', '409']),
        );
      }
      expect(JSON.stringify(document.paths)).not.toMatch(
        /\bown courses\b|\bnot the owner\b|\bor referenced\b/i,
      );
      const schemas = Object.keys(document.components?.schemas ?? {});
      expect(schemas).toEqual(
        expect.arrayContaining([
          'CreateCourseRequestDto',
          'AttachProblemRequestDto',
          'ReorderRequestDto',
          'CourseDetailResponseDto',
          'ManagedCourseResponseDto',
        ]),
      );
      expect(JSON.stringify(document)).not.toMatch(/testCase|harness|expectedOutput/i);
    });
  });

  describe('learner view (FR-009, FR-010)', () => {
    it('shows only visible problems with summaries, by id and by slug (AC-004)', async () => {
      const { id, chapterId } = await readyCourse('visible-course');
      catalog.setProblem(SECOND_PROBLEM, {
        publishStatus: 'PUBLISHED',
        title: 'Second',
        slug: 'second',
      });
      await attach(id, chapterId, SECOND_PROBLEM);
      await call('POST', `/api/courses/${id}/publish`);
      catalog.setProblem(SECOND_PROBLEM, {
        publishStatus: 'ON_HOLD',
        title: 'Second',
        slug: 'second',
      });

      const byId = await call('GET', `/api/courses/${id}`, { headers: studentHeaders() });
      const bySlug = await call('GET', '/api/courses/visible-course', {
        headers: studentHeaders(),
      });

      for (const res of [byId, bySlug]) {
        expect(res.status).toBe(200);
        expect(asList(asList(res.body.chapters)[0]!.problems)).toEqual([
          {
            id: PROBLEM_ID,
            slug: 'hello-world',
            title: 'Hello World',
            problemType: 'STANDARD',
            difficulty: 'EASY',
          },
        ]);
        expect(JSON.stringify(res.body)).not.toContain(SECOND_PROBLEM);
        expect(Object.keys(res.body).sort()).toEqual([
          'chapters',
          'description',
          'id',
          'slug',
          'title',
        ]);
      }
    });

    it('hides draft, on-hold and deleted courses from lists and direct lookups (AC-005)', async () => {
      const { id } = await readyCourse('published-one');
      await createCourse('just-a-draft');
      const held = await readyCourse('held-one');
      await call('POST', `/api/courses/${held.id}/publish`);
      await call('POST', `/api/courses/${held.id}/hold`);
      const gone = await readyCourse('gone-one');
      await call('POST', `/api/courses/${gone.id}/publish`);
      await call('DELETE', `/api/courses/${gone.id}`);
      await call('POST', `/api/courses/${id}/publish`);

      const list = await call('GET', '/api/courses');

      expect(asList(list.body.items).map((c) => c.slug)).toEqual(['published-one']);
      expect(list.body).toMatchObject({ total: 1, pageSize: 20 });
      expect(asList(list.body.items)[0]).toMatchObject({ chapterCount: 1 });
      for (const hidden of [held.id, gone.id, 'just-a-draft', 'held-one']) {
        expect((await call('GET', `/api/courses/${hidden}`)).status).toBe(404);
      }
    });
  });

  describe('authentication and authorization', () => {
    it('returns 401 for every kind of request without a principal (AC-003)', async () => {
      const anonymous = { headers: { 'content-type': 'application/json' } };
      const id = await createCourse();

      for (const [method, path] of [
        ['GET', '/api/courses'],
        ['GET', `/api/courses/${id}`],
        ['GET', '/api/courses/managed'],
        ['POST', '/api/courses'],
        ['PATCH', `/api/courses/${id}`],
        ['DELETE', `/api/courses/${id}`],
        ['POST', `/api/courses/${id}/publish`],
      ] as const) {
        expect((await call(method, path, anonymous)).status).toBe(401);
      }
    });

    it('returns 401 for a malformed user id and for duplicated identity headers', async () => {
      expect((await call('GET', '/api/courses', { headers: headers('not-a-uuid') })).status).toBe(
        401,
      );
      const res = await fetch(`${baseUrl}/api/courses/managed`, {
        headers: [
          ['x-auth-user-id', OWNER_ID],
          ['x-auth-user-id', OTHER_ID],
          ['x-auth-roles', 'ADMIN'],
          ['x-auth-permissions', 'course:read-managed'],
        ],
      });
      expect(res.status).toBe(401);
    });

    it('rejects a missing permission or ADMIN role while allowing another ADMIN to edit', async () => {
      const id = await createCourse();
      const before = repository.saveCount;

      const noPermission = await call('POST', '/api/courses', {
        headers: headers(OWNER_ID, 'ADMIN', 'course:read-managed'),
        body: { slug: 'x', title: 'X' },
      });
      const wrongRole = await call('POST', '/api/courses', {
        headers: headers(OTHER_ID, 'STUDENT', 'course:create'),
        body: { slug: 'x', title: 'X' },
      });
      const otherAdmin = await call('PATCH', `/api/courses/${id}`, {
        headers: headers(OTHER_ID),
        body: { title: 'Updated by another ADMIN' },
      });

      expect([noPermission.status, wrongRole.status, otherAdmin.status]).toEqual([403, 403, 200]);
      expect(repository.saveCount).toBe(before + 1);
    });

    it("lists another ADMIN's courses in the managed list", async () => {
      await createCourse();

      const res = await call('GET', '/api/courses/managed', { headers: headers(OTHER_ID) });

      expect(res.body.total).toBe(1);
    });
  });

  describe('validation (SR-005, AC-012, AC-016)', () => {
    it('rejects fields the client may not set and changes nothing (AC-016)', async () => {
      const before = repository.saveCount;
      const forbidden = [
        { createdBy: OTHER_ID },
        { status: 'PUBLISHED' },
        { deletedAt: '2026-01-01T00:00:00.000Z' },
        { createdAt: '2020-01-01T00:00:00.000Z' },
        { updatedAt: '2020-01-01T00:00:00.000Z' },
      ];

      for (const extra of forbidden) {
        const res = await call('POST', '/api/courses', {
          body: { slug: 'x', title: 'X', ...extra },
        });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_FAILED');
        expect(typeof res.body.message).toBe('string');
        expect(Array.isArray(res.body.details)).toBe(true);
      }
      expect(repository.saveCount).toBe(before);
    });

    it('rejects a slug on update (immutable) and unknown fields on PATCH', async () => {
      const id = await createCourse();

      expect((await call('PATCH', `/api/courses/${id}`, { body: { slug: 'other' } })).status).toBe(
        400,
      );
      expect(
        (await call('PATCH', `/api/courses/${id}`, { body: { status: 'PUBLISHED' } })).status,
      ).toBe(400);
    });

    it('rejects raw HTML/script in course and chapter descriptions (AC-012)', async () => {
      const id = await createCourse();
      const chapterId = await addChapter(id);
      const evil = '<script>alert(1)</script>';

      const results = await Promise.all([
        call('POST', '/api/courses', { body: { slug: 'evil', title: 'E', description: evil } }),
        call('PATCH', `/api/courses/${id}`, { body: { description: evil } }),
        call('POST', `/api/courses/${id}/chapters`, { body: { title: 'E', description: evil } }),
        call('PATCH', `/api/courses/${id}/chapters/${chapterId}`, { body: { description: evil } }),
      ]);

      expect(results.map((r) => r.status)).toEqual([400, 400, 400, 400]);
      const stored = await call('GET', `/api/courses/managed/${id}`);
      expect(stored.body.description).toBeNull();
    });

    it('rejects missing, mistyped and empty fields with details', async () => {
      for (const body of [
        { slug: 'x' },
        { title: 'X' },
        { slug: 1, title: 'X' },
        { slug: 'x', title: '   ' },
      ]) {
        const res = await call('POST', '/api/courses', { body });
        expect(res.status).toBe(400);
      }
    });

    it('rejects invalid pagination, ids and reorder payloads', async () => {
      const { id, chapterId } = await readyCourse();

      for (const path of [
        '/api/courses?page=0',
        '/api/courses?pageSize=51',
        '/api/courses/managed?pageSize=0',
      ]) {
        expect((await call('GET', path)).status).toBe(400);
      }
      expect((await call('GET', '/api/courses/managed/not-a-uuid')).status).toBe(400);
      for (const ids of [[], ['x'], [chapterId, chapterId]]) {
        expect(
          (await call('PUT', `/api/courses/${id}/chapters/order`, { body: { ids } })).status,
        ).toBe(400);
      }
      expect(
        (
          await call('PUT', `/api/courses/${id}/chapters/order`, {
            body: { orderedIds: [chapterId] },
          })
        ).status,
      ).toBe(400);
      expect((await attach(id, chapterId, 'not-a-uuid')).status).toBe(400);
    });

    it('rejects a reorder that is not exactly the current set and keeps the old order (AC-009)', async () => {
      const { id, chapterId } = await readyCourse();
      const other = await addChapter(id, 'Two');

      const res = await call('PUT', `/api/courses/${id}/chapters/order`, {
        body: { ids: [other] },
      });

      expect(res.status).toBe(400);
      const stored = await call('GET', `/api/courses/managed/${id}`);
      expect(asList(stored.body.chapters).map((c) => c.id)).toEqual([chapterId, other]);
    });
  });

  describe('error mapping', () => {
    it('returns 404 for an unknown course and an unknown chapter', async () => {
      const id = await createCourse();

      expect(
        (await call('PATCH', `/api/courses/${MISSING_ID}`, { body: { title: 'X' } })).status,
      ).toBe(404);
      expect((await call('DELETE', `/api/courses/${id}/chapters/${MISSING_ID}`)).status).toBe(404);
      expect(
        (await call('PATCH', `/api/courses/${id}/chapters/${MISSING_ID}`, { body: { title: 'X' } }))
          .status,
      ).toBe(404);
    });

    it('returns 409 for a duplicate slug (AC-011)', async () => {
      await createCourse('same-slug');

      const res = await call('POST', '/api/courses', {
        body: { slug: 'same-slug', title: 'Other' },
      });

      expect(res.status).toBe(409);
      expect(repository.store.size).toBe(1);
    });

    it('returns 409 for an invalid state transition', async () => {
      const id = await createCourse();

      expect((await call('POST', `/api/courses/${id}/hold`)).status).toBe(409);
      expect((await call('POST', `/api/courses/${id}/restore`)).status).toBe(409);
    });

    it('returns 400 with issues when publishing a course that is not ready (AC-006)', async () => {
      const id = await createCourse();

      const res = await call('POST', `/api/courses/${id}/publish`);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('COURSE_NOT_READY');
      expect(asList(res.body.details).map((issue) => issue.code)).toEqual(
        expect.arrayContaining(['CHAPTER_REQUIRED']),
      );
    });

    it('refuses to publish when the attached problem is not published', async () => {
      const { id } = await readyCourse();
      catalog.setProblem(PROBLEM_ID, { publishStatus: 'DRAFT' });

      const res = await call('POST', `/api/courses/${id}/publish`);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('COURSE_NOT_READY');
      expect(asList(res.body.details).map((issue) => issue.code)).toEqual([
        'PUBLISHED_CONTENT_REQUIRED',
      ]);
    });

    it("allows another ADMIN's draft but still rejects an unknown problem", async () => {
      const id = await createCourse();
      const chapterId = await addChapter(id);
      catalog.setProblem(SECOND_PROBLEM, {
        publishStatus: 'DRAFT',
        createdBy: OTHER_ID,
        title: 'Secret',
      });

      const foreign = await attach(id, chapterId, SECOND_PROBLEM);
      const unknown = await attach(id, chapterId, MISSING_ID);

      expect(foreign.status).toBe(201);
      expect(unknown.status).toBe(400);
      expect(JSON.stringify(unknown.body)).not.toContain('Secret');
    });

    it('returns 409 when the same problem is attached twice, in any chapter (AC-018)', async () => {
      const { id, chapterId } = await readyCourse();
      const second = await addChapter(id, 'Ch 2');

      expect((await attach(id, chapterId)).status).toBe(409);
      expect((await attach(id, second)).status).toBe(409);
    });

    it('returns 400 when a limit is exceeded and keeps state (AC-013)', async () => {
      const id = await createCourse();
      for (let i = 0; i < 50; i += 1) await addChapter(id, `C${i}`);

      expect(
        (await call('POST', `/api/courses/${id}/chapters`, { body: { title: 'extra' } })).status,
      ).toBe(400);
      expect(asList((await call('GET', `/api/courses/managed/${id}`)).body.chapters)).toHaveLength(
        50,
      );
    });

    it('does not leak internal error messages as 500s', async () => {
      const id = await createCourse();
      jest.spyOn(repository, 'save').mockRejectedValueOnce(new Error('connection string secret'));

      const res = await call('PATCH', `/api/courses/${id}`, { body: { title: 'X' } });

      expect(res.status).toBe(500);
      expect(res.body.code).toBe('INTERNAL_ERROR');
      expect(JSON.stringify(res.body)).not.toContain('connection string secret');
    });
  });

  describe('published courses stay publishable (FR-019, AC-019)', () => {
    it('refuses to detach the last published problem, with readiness issues', async () => {
      const { id, chapterId } = await readyCourse();
      await call('POST', `/api/courses/${id}/publish`);

      const res = await call(
        'DELETE',
        `/api/courses/${id}/chapters/${chapterId}/problems/${PROBLEM_ID}`,
      );

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('COURSE_NOT_READY');
      expect(asList(res.body.details).map((issue) => issue.code)).toEqual([
        'PUBLISHED_CONTENT_REQUIRED',
      ]);
      const stored = await call('GET', `/api/courses/managed/${id}`);
      expect(asList(asList(stored.body.chapters)[0]!.problems)).toHaveLength(1);
    });

    it('refuses to remove the last chapter of a published course but allows it for a draft', async () => {
      const published = await readyCourse('pub');
      await call('POST', `/api/courses/${published.id}/publish`);
      const draft = await readyCourse('drf');

      expect(
        (await call('DELETE', `/api/courses/${published.id}/chapters/${published.chapterId}`))
          .status,
      ).toBe(400);
      expect(
        (await call('DELETE', `/api/courses/${draft.id}/chapters/${draft.chapterId}`)).status,
      ).toBe(204);
    });

    it('edits a published course in place while it stays ready', async () => {
      const { id, chapterId } = await readyCourse();
      await call('POST', `/api/courses/${id}/publish`);
      catalog.setProblem(SECOND_PROBLEM);

      expect((await attach(id, chapterId, SECOND_PROBLEM)).status).toBe(201);
      expect(
        (await call('DELETE', `/api/courses/${id}/chapters/${chapterId}/problems/${PROBLEM_ID}`))
          .status,
      ).toBe(204);
      expect(
        (await call('PATCH', `/api/courses/${id}`, { body: { title: 'Edited' } })).body,
      ).toMatchObject({
        status: 'PUBLISHED',
        title: 'Edited',
      });
    });

    it('refuses edits to an on-hold course with 409', async () => {
      const { id } = await readyCourse();
      await call('POST', `/api/courses/${id}/publish`);
      await call('POST', `/api/courses/${id}/hold`);

      expect((await call('PATCH', `/api/courses/${id}`, { body: { title: 'X' } })).status).toBe(
        409,
      );
      expect(
        (await call('POST', `/api/courses/${id}/chapters`, { body: { title: 'X' } })).status,
      ).toBe(409);
    });
  });

  describe('delete and restore (FR-007, FR-018)', () => {
    it('hard-deletes a draft', async () => {
      const id = await createCourse();
      expect((await call('DELETE', `/api/courses/${id}`)).status).toBe(204);
      expect(repository.store.has(id)).toBe(false);
    });

    it('soft-deletes a published course, then restores its status', async () => {
      const { id } = await readyCourse();
      await call('POST', `/api/courses/${id}/publish`);

      expect((await call('DELETE', `/api/courses/${id}`)).status).toBe(204);
      expect(repository.store.has(id)).toBe(true);
      expect((await call('GET', `/api/courses/managed/${id}`)).status).toBe(404);
      const shown = await call('GET', `/api/courses/managed/${id}?includeDeleted=true`);
      expect(shown.body.deletedAt).not.toBeNull();
      expect((await call('GET', '/api/courses/managed')).body.total).toBe(0);
      expect((await call('GET', '/api/courses/managed?includeDeleted=true')).body.total).toBe(1);

      const restored = await call('POST', `/api/courses/${id}/restore`);
      expect(restored.body).toMatchObject({ status: 'PUBLISHED', deletedAt: null });
    });
  });
});
