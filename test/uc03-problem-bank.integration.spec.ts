import type { AddressInfo } from 'node:net';

import { ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { CoursesModule } from '@/modules/courses/courses.module';
import {
  ALL_COURSE_PERMISSIONS,
  assertTestDatabase,
  learningDataSourceOptions,
  TEST_DATABASE_URL,
} from '@/modules/courses/testing';
import { ProblemsModule } from '@/modules/problems/problems.module';

assertTestDatabase();

const describeIntegration = TEST_DATABASE_URL ? describe : describe.skip;

const LECTURER_A = '00000000-0000-4000-8000-0000000003a1';
const LECTURER_B = '00000000-0000-4000-8000-0000000003b2';
const ADMIN = '00000000-0000-4000-8000-0000000003c3';
const STUDENT = '00000000-0000-4000-8000-0000000003d4';
const MISSING = '00000000-0000-4000-8000-0000000003ff';

const PROBLEM_PERMISSIONS = [
  'problem:create',
  'problem:read-managed',
  'problem:update',
  'problem:publish',
  'problem:hold',
  'problem:republish',
  'problem:delete',
  'problem:restore',
];
const ALL_PERMISSIONS = [...PROBLEM_PERMISSIONS, ...ALL_COURSE_PERMISSIONS].join(',');

const as = (userId: string, roles: string, permissions = ALL_PERMISSIONS) => ({
  'content-type': 'application/json',
  'x-auth-user-id': userId,
  'x-auth-roles': roles,
  'x-auth-permissions': permissions,
});
const lecturerA = as(LECTURER_A, 'LECTURER');
const lecturerB = as(LECTURER_B, 'LECTURER');
const admin = as(ADMIN, 'ADMIN');
const student = as(STUDENT, 'STUDENT');

type Json = Record<string, unknown>;
const rows = (value: unknown) => value as Json[];

describeIntegration(
  'UC03 - problem bank, test cases and course ownership (real PostgreSQL)',
  () => {
    let app: NestExpressApplication;
    let dataSource: DataSource;
    let baseUrl: string;
    let seq = 0;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
            load: [() => ({ INTERNAL_SERVICE_SECRET: 'uc03-test-only' })],
          }),
          TypeOrmModule.forRoot({
            ...learningDataSourceOptions({ extra: { max: 4, connectionTimeoutMillis: 3000 } }),
            migrationsRun: true,
          }),
          ProblemsModule,
          CoursesModule,
        ],
      }).compile();
      app = moduleRef.createNestApplication<NestExpressApplication>();
      app.useGlobalPipes(
        new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
      );
      app.useBodyParser('json', { limit: '4mb' });
      await app.listen(0, '127.0.0.1');
      dataSource = app.get(DataSource);
      const address = (app.getHttpServer() as { address(): AddressInfo | string | null }).address();
      if (address === null || typeof address === 'string') throw new Error('Expected a TCP port');
      baseUrl = `http://127.0.0.1:${address.port}`;
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
        headers: options.headers ?? lecturerA,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
      const text = await response.text();
      return { status: response.status, body: (text ? JSON.parse(text) : {}) as Json };
    };

    const payload = (overrides: Json = {}): Json => {
      seq += 1;
      return {
        slug: `uc03-${Date.now()}-${seq}`,
        title: `UC03 problem ${seq}`,
        statement: 'Return the sum of two integers.',
        inputSpecification: 'Two integers',
        outputSpecification: 'One integer',
        problemType: 'STANDARD',
        difficulty: 'EASY',
        enabledLanguages: ['python'],
        ...overrides,
      };
    };

    const createProblem = async (headers = lecturerA, overrides: Json = {}) => {
      const res = await call('POST', '/api/problems', { headers, body: payload(overrides) });
      expect(res.status).toBe(201);
      return res.body.id as string;
    };

    const addCase = (
      problemId: string,
      body: Json = { input: '1 2', expectedOutput: '3', score: 10, visibility: 'HIDDEN' },
      headers = lecturerA,
    ) => call('POST', `/api/problems/${problemId}/test-cases`, { headers, body });

    const readyProblem = async (headers = lecturerA) => {
      const id = await createProblem(headers);
      expect((await addCase(id, undefined, headers)).status).toBe(201);
      return id;
    };

    describe('A. Problem create/validate/ownership', () => {
      it('UC03-A1 lecturer creates a DRAFT owned by self and DB stores created_by', async () => {
        const res = await call('POST', '/api/problems', { body: payload() });
        expect(res.status).toBe(201);
        expect(res.body.publishStatus).toBe('DRAFT');
        const [row] = await dataSource.query<Json[]>(
          `SELECT "created_by", "publish_status" FROM "problems" WHERE "id" = $1`,
          [res.body.id],
        );
        expect(row).toEqual({ created_by: LECTURER_A, publish_status: 'DRAFT' });
      });

      it('UC03-A2 rejects invalid create payloads with 400 and writes nothing', async () => {
        const before = await dataSource.query<Json[]>(`SELECT count(*)::int AS n FROM "problems"`);
        const bad: Json[] = [
          payload({ title: undefined }),
          payload({ slug: 'Bad Slug!' }),
          payload({ difficulty: 'IMPOSSIBLE' }),
          payload({ problemType: 'QUIZ' }),
          payload({ title: 'x'.repeat(201) }),
          payload({ statement: '' }),
          payload({ createdBy: LECTURER_B }),
          payload({ publishStatus: 'PUBLISHED' }),
        ];
        for (const body of bad) {
          expect((await call('POST', '/api/problems', { body })).status).toBe(400);
        }
        const after = await dataSource.query<Json[]>(`SELECT count(*)::int AS n FROM "problems"`);
        expect(after[0]!.n).toBe(before[0]!.n);
      });

      it('UC03-A3 duplicate slug returns 409', async () => {
        const body = payload();
        expect((await call('POST', '/api/problems', { body })).status).toBe(201);
        expect((await call('POST', '/api/problems', { headers: lecturerB, body })).status).toBe(
          409,
        );
      });

      it('UC03-A4 STUDENT, missing permission and forged headers cannot create', async () => {
        expect(
          (await call('POST', '/api/problems', { headers: student, body: payload() })).status,
        ).toBe(403);
        const noPerm = as(LECTURER_A, 'LECTURER', 'problem:read-managed');
        expect(
          (await call('POST', '/api/problems', { headers: noPerm, body: payload() })).status,
        ).toBe(403);
        const noHeaders = { 'content-type': 'application/json' };
        expect(
          (await call('POST', '/api/problems', { headers: noHeaders, body: payload() })).status,
        ).toBe(401);
        const badId = as('not-a-uuid', 'LECTURER');
        expect(
          (await call('POST', '/api/problems', { headers: badId, body: payload() })).status,
        ).toBe(401);
      });

      it('UC03-A5 another lecturer cannot read/update/publish/hold/delete; admin can', async () => {
        const id = await readyProblem(lecturerA);
        expect(
          (await call('GET', `/api/problems/managed/${id}`, { headers: lecturerB })).status,
        ).toBe(403);
        expect(
          (await call('PATCH', `/api/problems/${id}`, { headers: lecturerB, body: { title: 'x' } }))
            .status,
        ).toBe(403);
        expect(
          (await call('POST', `/api/problems/${id}/publish`, { headers: lecturerB, body: {} }))
            .status,
        ).toBe(403);
        expect((await call('DELETE', `/api/problems/${id}`, { headers: lecturerB })).status).toBe(
          403,
        );
        const stored = await dataSource.query<Json[]>(
          `SELECT "title", "publish_status", "deleted_at" FROM "problems" WHERE "id" = $1`,
          [id],
        );
        expect(stored[0]!.publish_status).toBe('DRAFT');
        expect(stored[0]!.deleted_at).toBeNull();
        expect(
          (
            await call('PATCH', `/api/problems/${id}`, {
              headers: admin,
              body: { title: 'Admin edit' },
            })
          ).status,
        ).toBe(200);
        expect(
          (await call('POST', `/api/problems/${id}/publish`, { headers: admin, body: {} })).status,
        ).toBe(200);
      });

      it('UC03-A6 unknown id returns 404 and malformed id returns 400', async () => {
        expect((await call('GET', `/api/problems/managed/${MISSING}`)).status).toBe(404);
        expect(
          (await call('PATCH', `/api/problems/${MISSING}`, { body: { title: 'x' } })).status,
        ).toBe(404);
        expect((await call('GET', '/api/problems/managed/not-a-uuid')).status).toBe(400);
      });

      it('UC03-A7 update rejects immutable/unknown fields (slug, createdBy) with 400', async () => {
        const id = await createProblem();
        expect(
          (await call('PATCH', `/api/problems/${id}`, { body: { slug: 'new-slug' } })).status,
        ).toBe(400);
        expect(
          (await call('PATCH', `/api/problems/${id}`, { body: { createdBy: LECTURER_B } })).status,
        ).toBe(400);
        expect(
          (
            await call('PATCH', `/api/problems/${id}`, {
              body: { difficulty: 'HARD', title: 'New' },
            })
          ).status,
        ).toBe(200);
      });
    });

    describe('B. Managed list scoping', () => {
      it('UC03-B1 lecturer list only has own problems, admin sees all', async () => {
        const idA = await createProblem(lecturerA);
        const idB = await createProblem(lecturerB);
        const ids = async (headers: Record<string, string>) =>
          rows((await call('GET', '/api/problems/managed?limit=100', { headers })).body.items).map(
            (r) => r.id,
          );
        const a = await ids(lecturerA);
        const b = await ids(lecturerB);
        const all = await ids(admin);
        expect(a).toContain(idA);
        expect(a).not.toContain(idB);
        expect(b).toContain(idB);
        expect(b).not.toContain(idA);
        expect(all).toEqual(expect.arrayContaining([idA, idB]));
      });

      it('UC03-B2 student is rejected from the managed list and invalid paging is 400', async () => {
        expect((await call('GET', '/api/problems/managed', { headers: student })).status).toBe(403);
        expect((await call('GET', '/api/problems/managed?page=0')).status).toBe(400);
        expect((await call('GET', '/api/problems/managed?limit=1000')).status).toBe(400);
      });
    });

    describe('C. Test cases over HTTP', () => {
      it('UC03-C1 add HIDDEN and SAMPLE, list returns suite summary, get returns detail', async () => {
        const id = await createProblem();
        const hidden = await addCase(id, { input: '1 2', expectedOutput: '3', score: 10 });
        const sample = await addCase(id, {
          input: '2 2',
          expectedOutput: '4',
          score: 0,
          visibility: 'SAMPLE',
        });
        expect(hidden.status).toBe(201);
        expect(hidden.body.visibility).toBe('HIDDEN');
        expect(sample.status).toBe(201);
        expect(sample.body.visibility).toBe('SAMPLE');
        const list = await call('GET', `/api/problems/managed/${id}/test-cases`);
        expect(list.status).toBe(200);
        expect(rows(list.body.items)).toHaveLength(2);
        expect(list.body.testSuiteSummary).toMatchObject({
          totalCount: 2,
          hiddenCount: 1,
          totalScore: 10,
        });
        const one = await call(
          'GET',
          `/api/problems/managed/${id}/test-cases/${hidden.body.id as string}`,
        );
        expect(one.status).toBe(200);
        expect(one.body.expectedOutput).toBe('3');
      });

      it('UC03-C2 add rejects invalid body (negative score, bad visibility, extra field, missing expectedOutput)', async () => {
        const id = await createProblem();
        for (const body of [
          { expectedOutput: '3', score: -1 },
          { expectedOutput: '3', score: 1, visibility: 'SECRET' },
          { expectedOutput: '3', score: 1.5 },
          { score: 1 },
          { expectedOutput: '3', score: 1, problemId: MISSING },
        ]) {
          expect((await addCase(id, body)).status).toBe(400);
        }
        const list = await call('GET', `/api/problems/managed/${id}/test-cases`);
        expect(rows(list.body.items)).toHaveLength(0);
      });

      it('UC03-C3 duplicate displayOrder is rejected and nothing is written', async () => {
        const id = await createProblem();
        expect((await addCase(id, { expectedOutput: '1', score: 1, displayOrder: 0 })).status).toBe(
          201,
        );
        const dup = await addCase(id, { expectedOutput: '2', score: 1, displayOrder: 0 });
        expect([400, 409]).toContain(dup.status);
        const list = await call('GET', `/api/problems/managed/${id}/test-cases`);
        expect(rows(list.body.items)).toHaveLength(1);
      });

      it('UC03-C4 update changes score/visibility; 404 for unknown test case; 400 for invalid body', async () => {
        const id = await createProblem();
        const created = await addCase(id);
        const caseId = created.body.id as string;
        const upd = await call('PATCH', `/api/problems/${id}/test-cases/${caseId}`, {
          body: { score: 25, expectedOutput: '30' },
        });
        expect(upd.status).toBe(200);
        expect(upd.body.score).toBe(25);
        expect(upd.body.expectedOutput).toBe('30');
        expect(
          (await call('PATCH', `/api/problems/${id}/test-cases/${MISSING}`, { body: { score: 1 } }))
            .status,
        ).toBe(404);
        expect(
          (await call('PATCH', `/api/problems/${id}/test-cases/${caseId}`, { body: { score: -5 } }))
            .status,
        ).toBe(400);
      });

      it('UC03-C5 reorder applies a full permutation and rejects partial/duplicate/unknown sets', async () => {
        const id = await createProblem();
        const ids: string[] = [];
        for (const out of ['a', 'b', 'c']) {
          ids.push((await addCase(id, { expectedOutput: out, score: 1 })).body.id as string);
        }
        const reversed = [...ids].reverse();
        const ok = await call('PUT', `/api/problems/${id}/test-cases/order`, {
          body: { testCaseIds: reversed },
        });
        expect(ok.status).toBe(200);
        const list = await call('GET', `/api/problems/managed/${id}/test-cases`);
        expect(rows(list.body.items).map((r) => r.id)).toEqual(reversed);
        expect(
          (
            await call('PUT', `/api/problems/${id}/test-cases/order`, {
              body: { testCaseIds: [ids[0]] },
            })
          ).status,
        ).toBe(400);
        expect(
          (
            await call('PUT', `/api/problems/${id}/test-cases/order`, {
              body: { testCaseIds: [ids[0], ids[0], ids[1]] },
            })
          ).status,
        ).toBe(400);
        expect(
          (
            await call('PUT', `/api/problems/${id}/test-cases/order`, {
              body: { testCaseIds: [ids[0], ids[1], MISSING] },
            })
          ).status,
        ).toBe(400);
        const after = await call('GET', `/api/problems/managed/${id}/test-cases`);
        expect(rows(after.body.items).map((r) => r.id)).toEqual(reversed);
      });

      it('UC03-C6 delete removes the test case from the problem and 404 on repeat', async () => {
        const id = await createProblem();
        const caseId = (await addCase(id)).body.id as string;
        const del = await call('DELETE', `/api/problems/${id}/test-cases/${caseId}`);
        expect([200, 204]).toContain(del.status);
        expect((await call('DELETE', `/api/problems/${id}/test-cases/${caseId}`)).status).toBe(404);
        const list = await call('GET', `/api/problems/managed/${id}/test-cases`);
        expect(rows(list.body.items)).toHaveLength(0);
      });

      it('UC03-C7 another lecturer/student/forged header cannot touch the test cases; admin can', async () => {
        const id = await readyProblem(lecturerA);
        const caseId = (await call('GET', `/api/problems/managed/${id}/test-cases`)).body
          .items as Json[];
        const tcId = caseId[0]!.id as string;
        for (const headers of [lecturerB, student]) {
          expect(
            (await call('GET', `/api/problems/managed/${id}/test-cases`, { headers })).status,
          ).toBe(403);
          expect(
            (await call('GET', `/api/problems/managed/${id}/test-cases/${tcId}`, { headers }))
              .status,
          ).toBe(403);
          expect((await addCase(id, undefined, headers)).status).toBe(403);
          expect(
            (
              await call('PATCH', `/api/problems/${id}/test-cases/${tcId}`, {
                headers,
                body: { score: 1 },
              })
            ).status,
          ).toBe(403);
          expect(
            (await call('DELETE', `/api/problems/${id}/test-cases/${tcId}`, { headers })).status,
          ).toBe(403);
          expect(
            (
              await call('PUT', `/api/problems/${id}/test-cases/order`, {
                headers,
                body: { testCaseIds: [tcId] },
              })
            ).status,
          ).toBe(403);
        }
        const stillThere = await call('GET', `/api/problems/managed/${id}/test-cases`);
        expect(rows(stillThere.body.items)).toHaveLength(1);
        expect(
          (await call('GET', `/api/problems/managed/${id}/test-cases`, { headers: admin })).status,
        ).toBe(200);
        expect((await addCase(id, { expectedOutput: '9', score: 1 }, admin)).status).toBe(201);
      });

      it('UC03-C8 hidden test case data never appears on the public problem detail', async () => {
        const id = await createProblem(lecturerA);
        await addCase(id, { input: 'SECRET-IN', expectedOutput: 'SECRET-OUT', score: 5 });
        expect((await call('POST', `/api/problems/${id}/publish`, { body: {} })).status).toBe(200);
        const pub = await call('GET', `/api/problems/${id}`, { headers: student });
        expect(pub.status).toBe(200);
        expect(JSON.stringify(pub.body)).not.toContain('SECRET-OUT');
        expect(JSON.stringify(pub.body)).not.toContain('SECRET-IN');
      });
    });

    describe('D. Publish readiness and lifecycle with real test cases', () => {
      it('UC03-D1 publish without a hidden test case is 400 with issues and status stays DRAFT', async () => {
        const id = await createProblem();
        const res = await call('POST', `/api/problems/${id}/publish`, { body: {} });
        expect(res.status).toBe(400);
        expect(JSON.stringify(res.body.issues)).toContain('TEST_CASE_HIDDEN_REQUIRED');
        const [row] = await dataSource.query<Json[]>(
          `SELECT "publish_status" FROM "problems" WHERE "id" = $1`,
          [id],
        );
        expect(row!.publish_status).toBe('DRAFT');
      });

      it('UC03-D2 only a SAMPLE test case does not make the problem publishable', async () => {
        const id = await createProblem();
        await addCase(id, { expectedOutput: '1', score: 0, visibility: 'SAMPLE' });
        const res = await call('POST', `/api/problems/${id}/publish`, { body: {} });
        expect(res.status).toBe(400);
      });

      it('UC03-D3 publish -> hold -> republish -> invalid transitions return 409', async () => {
        const id = await readyProblem();
        expect(
          (await call('POST', `/api/problems/${id}/publish`, { body: {} })).body.publishStatus,
        ).toBe('PUBLISHED');
        expect((await call('POST', `/api/problems/${id}/publish`, { body: {} })).status).toBe(409);
        expect(
          (await call('POST', `/api/problems/${id}/hold`, { body: {} })).body.publishStatus,
        ).toBe('ON_HOLD');
        expect((await call('POST', `/api/problems/${id}/hold`, { body: {} })).status).toBe(409);
        expect(
          (await call('POST', `/api/problems/${id}/republish`, { body: {} })).body.publishStatus,
        ).toBe('PUBLISHED');
        expect((await call('POST', `/api/problems/${id}/republish`, { body: {} })).status).toBe(
          409,
        );
      });

      it('UC03-D4 hold/republish are denied to another lecturer and student', async () => {
        const id = await readyProblem();
        await call('POST', `/api/problems/${id}/publish`, { body: {} });
        for (const headers of [lecturerB, student]) {
          expect(
            (await call('POST', `/api/problems/${id}/hold`, { headers, body: {} })).status,
          ).toBe(403);
        }
        const [row] = await dataSource.query<Json[]>(
          `SELECT "publish_status" FROM "problems" WHERE "id" = $1`,
          [id],
        );
        expect(row!.publish_status).toBe('PUBLISHED');
      });

      it('UC03-D5 removing the last hidden test case of a PUBLISHED problem is refused', async () => {
        const id = await readyProblem();
        await call('POST', `/api/problems/${id}/publish`, { body: {} });
        const list = await call('GET', `/api/problems/managed/${id}/test-cases`);
        const tcId = rows(list.body.items)[0]!.id as string;
        const del = await call('DELETE', `/api/problems/${id}/test-cases/${tcId}`);
        expect(del.status).toBe(400);
        expect(JSON.stringify(del.body.issues)).toContain('TEST_CASE_HIDDEN_REQUIRED');
        const after = await call('GET', `/api/problems/managed/${id}/test-cases`);
        expect(rows(after.body.items)).toHaveLength(1);
      });

      it('UC03-D6 soft delete hides from public/managed list, restore brings it back with the same status', async () => {
        const id = await readyProblem();
        await call('POST', `/api/problems/${id}/publish`, { body: {} });
        const del = await call('DELETE', `/api/problems/${id}`);
        expect(del.status).toBe(200);
        expect((await call('GET', `/api/problems/${id}`, { headers: student })).status).toBe(404);
        expect((await call('GET', `/api/problems/managed/${id}`)).status).toBe(404);
        const [row] = await dataSource.query<Json[]>(
          `SELECT "deleted_at" FROM "problems" WHERE "id" = $1`,
          [id],
        );
        expect(row!.deleted_at).not.toBeNull();
        expect(
          (await call('POST', `/api/problems/${id}/restore`, { headers: lecturerB, body: {} }))
            .status,
        ).toBe(403);
        const restored = await call('POST', `/api/problems/${id}/restore`, { body: {} });
        expect(restored.status).toBe(200);
        expect(restored.body.publishStatus).toBe('PUBLISHED');
        expect((await call('GET', `/api/problems/${id}`, { headers: student })).status).toBe(200);
      });

      it('UC03-D7 harness is rejected for a STANDARD problem and the route enforces ownership', async () => {
        const id = await createProblem();
        const set = await call('PUT', `/api/problems/${id}/harnesses/python`, {
          body: { source: 'print(1)' },
        });
        expect(set.status).toBeGreaterThanOrEqual(400);
        expect(set.status).toBeLessThan(500);
        expect(
          (
            await call('PUT', `/api/problems/${id}/harnesses/python`, {
              headers: lecturerB,
              body: { source: 'x' },
            })
          ).status,
        ).toBe(403);
        expect(
          (await call('PUT', `/api/problems/${id}/harnesses/cobol`, { body: { source: 'x' } }))
            .status,
        ).toBe(400);
        expect(
          (await call('PUT', `/api/problems/${id}/harnesses/python`, { body: { source: '' } }))
            .status,
        ).toBe(400);
      });

      it('UC03-D8 FUNCTION problem accepts a harness (PUT/GET/DELETE) for an enabled language', async () => {
        const id = await createProblem(lecturerA, {
          problemType: 'FUNCTION',
          inputSpecification: null,
          outputSpecification: null,
          enabledLanguages: ['python'],
          starterCodes: [{ language: 'python', sourceCode: 'def add(a, b):\n    pass\n' }],
          functionContracts: [
            {
              language: 'python',
              functionName: 'add',
              parameters: [
                { name: 'a', type: 'int' },
                { name: 'b', type: 'int' },
              ],
              returnType: 'int',
            },
          ],
        });
        const set = await call('PUT', `/api/problems/${id}/harnesses/python`, {
          body: { source: 'print(add(1, 2))' },
        });
        expect(set.status).toBe(200);
        const got = await call('GET', `/api/problems/managed/${id}/harnesses/python`);
        expect(got.status).toBe(200);
        expect(got.body.source).toBe('print(add(1, 2))');
        expect(
          (
            await call('GET', `/api/problems/managed/${id}/harnesses/python`, {
              headers: lecturerB,
            })
          ).status,
        ).toBe(403);
        const del = await call('DELETE', `/api/problems/${id}/harnesses/python`);
        expect([200, 204]).toContain(del.status);
        expect((await call('GET', `/api/problems/managed/${id}/harnesses/python`)).status).toBe(
          404,
        );
      });
    });

    describe('E. Course/chapter ownership (LRN-009) against real DB', () => {
      const courseBody = (overrides: Json = {}) => {
        seq += 1;
        return {
          slug: `uc03-course-${Date.now()}-${seq}`,
          title: `UC03 course ${seq}`,
          ...overrides,
        };
      };

      const publishedProblem = async (headers = lecturerA) => {
        const id = await readyProblem(headers);
        expect(
          (await call('POST', `/api/problems/${id}/publish`, { headers, body: {} })).status,
        ).toBe(200);
        return id;
      };

      const newCourseWithChapter = async (headers = lecturerA) => {
        const created = await call('POST', '/api/courses', { headers, body: courseBody() });
        expect(created.status).toBe(201);
        const courseId = created.body.id as string;
        const withChapter = await call('POST', `/api/courses/${courseId}/chapters`, {
          headers,
          body: { title: 'Chapter 1' },
        });
        expect(withChapter.status).toBe(201);
        return { courseId, chapterId: rows(withChapter.body.chapters)[0]!.id as string };
      };

      it('UC03-E1 lecturer attaches own PUBLISHED problem, publishes the course; learner sees it', async () => {
        const problemId = await publishedProblem();
        const { courseId, chapterId } = await newCourseWithChapter();
        const attach = await call(
          'POST',
          `/api/courses/${courseId}/chapters/${chapterId}/problems`,
          {
            body: { problemId },
          },
        );
        expect(attach.status).toBe(201);
        expect((await call('POST', `/api/courses/${courseId}/publish`)).status).toBe(200);
        const pub = await call('GET', `/api/courses/${courseId}`, { headers: student });
        expect(pub.status).toBe(200);
      });

      it('UC03-E2 lecturer cannot attach another lecturer problem; the problem existence is not leaked', async () => {
        const foreign = await publishedProblem(lecturerB);
        const { courseId, chapterId } = await newCourseWithChapter(lecturerA);
        const denied = await call(
          'POST',
          `/api/courses/${courseId}/chapters/${chapterId}/problems`,
          {
            body: { problemId: foreign },
          },
        );
        const unknown = await call(
          'POST',
          `/api/courses/${courseId}/chapters/${chapterId}/problems`,
          {
            body: { problemId: MISSING },
          },
        );
        expect(denied.status).toBe(400);
        expect(unknown.status).toBe(400);
        expect(JSON.stringify(denied.body)).toEqual(
          JSON.stringify(unknown.body).replace(MISSING, foreign),
        );
      });

      it('UC03-E3 admin can attach any lecturer problem', async () => {
        const foreign = await publishedProblem(lecturerB);
        const { courseId, chapterId } = await newCourseWithChapter(admin);
        const res = await call('POST', `/api/courses/${courseId}/chapters/${chapterId}/problems`, {
          headers: admin,
          body: { problemId: foreign },
        });
        expect(res.status).toBe(201);
      });

      it('UC03-E4 another lecturer/student cannot read, edit, structure or publish the course', async () => {
        const { courseId, chapterId } = await newCourseWithChapter(lecturerA);
        for (const headers of [lecturerB, student]) {
          expect((await call('GET', `/api/courses/managed/${courseId}`, { headers })).status).toBe(
            403,
          );
          expect(
            (await call('PATCH', `/api/courses/${courseId}`, { headers, body: { title: 'x' } }))
              .status,
          ).toBe(403);
          expect(
            (
              await call('POST', `/api/courses/${courseId}/chapters`, {
                headers,
                body: { title: 'x' },
              })
            ).status,
          ).toBe(403);
          expect(
            (
              await call('PATCH', `/api/courses/${courseId}/chapters/${chapterId}`, {
                headers,
                body: { title: 'x' },
              })
            ).status,
          ).toBe(403);
          expect(
            (await call('DELETE', `/api/courses/${courseId}/chapters/${chapterId}`, { headers }))
              .status,
          ).toBe(403);
          expect((await call('POST', `/api/courses/${courseId}/publish`, { headers })).status).toBe(
            403,
          );
          expect((await call('DELETE', `/api/courses/${courseId}`, { headers })).status).toBe(403);
        }
        const [row] = await dataSource.query<Json[]>(
          `SELECT count(*)::int AS n FROM "courses" WHERE "id" = $1`,
          [courseId],
        );
        expect(row!.n).toBe(1);
      });

      it('UC03-E5 course list is scoped to the owner for lecturers and open for admin', async () => {
        const token = `cl${Date.now()}`;
        await call('POST', '/api/courses', {
          headers: lecturerA,
          body: courseBody({ title: `${token} A` }),
        });
        await call('POST', '/api/courses', {
          headers: lecturerB,
          body: courseBody({ title: `${token} B` }),
        });
        const a = await call('GET', `/api/courses/managed?q=${token}`, { headers: lecturerA });
        const all = await call('GET', `/api/courses/managed?q=${token}`, { headers: admin });
        expect(a.body.total).toBe(1);
        expect(all.body.total).toBe(2);
      });

      it('UC03-E6 forged x-auth-permissions with STUDENT role never grants course management', async () => {
        expect(
          (await call('POST', '/api/courses', { headers: student, body: courseBody() })).status,
        ).toBe(403);
        expect((await call('GET', '/api/courses/managed', { headers: student })).status).toBe(403);
      });

      it('UC03-E7 chapter reorder works for owner and a wrong set is rejected keeping the old order', async () => {
        const { courseId } = await newCourseWithChapter();
        const second = await call('POST', `/api/courses/${courseId}/chapters`, {
          body: { title: 'Chapter 2' },
        });
        const ids = rows(second.body.chapters).map((c) => c.id as string);
        expect(ids).toHaveLength(2);
        const reversed = [...ids].reverse();
        const ok = await call('PUT', `/api/courses/${courseId}/chapters/order`, {
          body: { ids: reversed },
        });
        expect(ok.status).toBe(200);
        expect(rows(ok.body.chapters).map((c) => c.id)).toEqual(reversed);
        const bad = await call('PUT', `/api/courses/${courseId}/chapters/order`, {
          body: { ids: [ids[0]] },
        });
        expect(bad.status).toBe(400);
        const view = await call('GET', `/api/courses/managed/${courseId}`);
        expect(rows(view.body.chapters).map((c) => c.id)).toEqual(reversed);
      });

      it('UC03-E8 problem ordering inside a chapter, and detach removes only the link', async () => {
        const p1 = await publishedProblem();
        const p2 = await publishedProblem();
        const { courseId, chapterId } = await newCourseWithChapter();
        for (const problemId of [p1, p2]) {
          expect(
            (
              await call('POST', `/api/courses/${courseId}/chapters/${chapterId}/problems`, {
                body: { problemId },
              })
            ).status,
          ).toBe(201);
        }
        const reorder = await call(
          'PUT',
          `/api/courses/${courseId}/chapters/${chapterId}/problems/order`,
          { body: { ids: [p2, p1] } },
        );
        expect(reorder.status).toBe(200);
        const detach = await call(
          'DELETE',
          `/api/courses/${courseId}/chapters/${chapterId}/problems/${p1}`,
        );
        expect([200, 204]).toContain(detach.status);
        const [row] = await dataSource.query<Json[]>(
          `SELECT count(*)::int AS n FROM "problems" WHERE "id" = $1`,
          [p1],
        );
        expect(row!.n).toBe(1);
      });
    });
  },
);
