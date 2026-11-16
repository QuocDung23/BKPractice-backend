import { randomUUID } from 'node:crypto';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { HttpModule } from '@nestjs/axios';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { NextFunction, Request, Response } from 'express';
import { DataSource } from 'typeorm';

import { GatewaySessionService } from '../apps/api-gateway/src/application/auth/gateway-session.service';
import { GatewayProxyService } from '../apps/api-gateway/src/application/proxy/gateway-proxy.service';
import { GatewayProxyController } from '../apps/api-gateway/src/presentation/controllers/gateway-proxy.controller';
import { GatewayAuthMiddleware } from '../apps/api-gateway/src/presentation/middleware/gateway-auth.middleware';
import { RunCodeUseCase } from '../apps/submission-service/src/modules/run-code/application/run-code.use-case';
import { RunCodeController } from '../apps/submission-service/src/modules/run-code/presentation/run-code.controller';
import { ApplyRunJudgeResultUseCase } from '../apps/submission-service/src/modules/submissions/application/apply-run-judge-result.use-case';
import { ApplySubmitJudgeResultUseCase } from '../apps/submission-service/src/modules/submissions/application/apply-submit-judge-result.use-case';
import { ExpireStaleSubmissionsUseCase } from '../apps/submission-service/src/modules/submissions/application/expire-stale-submissions.use-case';
import { GetSubmissionDetailUseCase } from '../apps/submission-service/src/modules/submissions/application/get-submission-detail.use-case';
import { ListSubmissionHistoryUseCase } from '../apps/submission-service/src/modules/submissions/application/list-submission-history.use-case';
import { RelayAcceptedEventsUseCase } from '../apps/submission-service/src/modules/submissions/application/relay-accepted-events.use-case';
import { SubmitCodeUseCase } from '../apps/submission-service/src/modules/submissions/application/submit-code.use-case';
import type {
  AcceptedEventPort,
  AcceptedProgressEvent,
} from '../apps/submission-service/src/modules/submissions/domain/ports/accepted-event.port';
import type {
  JudgeJobPort,
  RunJudgeJob,
  SubmitJudgeJob,
} from '../apps/submission-service/src/modules/submissions/domain/ports/judge-job.port';
import {
  JudgePackageUnavailableError,
  type JudgePackage,
  type LearningJudgePackagePort,
  ProblemNotSubmittableError,
} from '../apps/submission-service/src/modules/submissions/domain/ports/learning-judge-package.port';
import type {
  RealtimePort,
  SubmissionRealtimeNotification,
} from '../apps/submission-service/src/modules/submissions/domain/ports/realtime.port';
import { SubmissionAcceptedOutbox } from '../apps/submission-service/src/modules/submissions/infrastructure/persistence/submission-accepted-outbox.entity';
import {
  Submission,
  SubmissionResult,
} from '../apps/submission-service/src/modules/submissions/infrastructure/persistence/submission.entity';
import { TypeormSubmissionCountReader } from '../apps/submission-service/src/modules/submissions/infrastructure/persistence/typeorm-submission-count.reader';
import { TypeormSubmissionRepository } from '../apps/submission-service/src/modules/submissions/infrastructure/persistence/typeorm-submission.repository';
import { JudgeResultConsumer } from '../apps/submission-service/src/modules/submissions/presentation/judge-result.consumer';
import { SubmissionsController } from '../apps/submission-service/src/modules/submissions/presentation/submissions.controller';

/**
 * Black-box API tests for UC02 "Luyen tap lap trinh" (API02_*).
 * Real Gateway auth middleware + proxy -> real Submission controllers, use cases and
 * TypeORM repository on PostgreSQL. Learning is a stub HTTP server for public reads (gateway
 * transport) and a fake LearningJudgePackagePort for Submit; the Judge queue is a fake
 * JudgeJobPort (no RabbitMQ, no Docker). Verdicts are fed through the real JudgeResultConsumer.
 * Test titles start with a stable tag, for example "[RUN-01]", used by the report.
 */
const testUrl = process.env.UC02_SUBMISSION_TEST_DATABASE_URL;
const databaseTests = testUrl ? describe : describe.skip;

type Json = Record<string, unknown>;
interface ApiResult {
  status: number;
  body: Json;
  text: string;
}
interface Captured {
  method?: string;
  url?: string;
  headers: IncomingHttpHeaders;
}

const SECRET = 'a'.repeat(32);
const SECRET_EXPECTED = 'HIDDEN_EXPECTED_OUTPUT_42';
const SECRET_HARNESS = 'HIDDEN_HARNESS_SOURCE';

class FakeLearning implements LearningJudgePackagePort {
  mode: 'ok' | 'refuse' | 'down' = 'ok';
  disabledLanguages = new Set<string>();
  calls: Array<[string, string]> = [];

  getPackage(problemId: string, language: string): Promise<JudgePackage> {
    this.calls.push([problemId, language]);
    if (this.mode === 'down') return Promise.reject(new JudgePackageUnavailableError());
    if (this.mode === 'refuse' || this.disabledLanguages.has(language)) {
      return Promise.reject(new ProblemNotSubmittableError());
    }
    return Promise.resolve({
      problemType: 'STANDARD',
      timeLimitMs: 1000,
      memoryLimitMb: 128,
      hiddenHarness: SECRET_HARNESS,
      testCases: [{ stdin: '1 2', expectedOutput: SECRET_EXPECTED, score: 10 }],
    });
  }
}

class FakeJudge implements JudgeJobPort {
  jobs: Array<RunJudgeJob | SubmitJudgeJob> = [];
  fail = false;

  publish(job: RunJudgeJob | SubmitJudgeJob): Promise<void> {
    if (this.fail) return Promise.reject(new Error('broker down'));
    this.jobs.push(job);
    return Promise.resolve();
  }
}

class FakeRealtime implements RealtimePort {
  sent: Array<{ ownerId: string; notification: SubmissionRealtimeNotification }> = [];

  publishResult(ownerId: string, notification: SubmissionRealtimeNotification): Promise<void> {
    this.sent.push({ ownerId, notification });
    return Promise.resolve();
  }
}

class FakeAcceptedEvents implements AcceptedEventPort {
  events: AcceptedProgressEvent[] = [];

  publish(event: AcceptedProgressEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }
}

databaseTests('UC02 practice API - Gateway, Submission and PostgreSQL', () => {
  const schema = `uc02_${randomUUID().replaceAll('-', '')}`;
  const learning = new FakeLearning();
  const judge = new FakeJudge();
  const realtime = new FakeRealtime();
  const acceptedEvents = new FakeAcceptedEvents();
  const jwt = new JwtService();
  let sessionActive = true;
  let administration: DataSource;
  let database: DataSource;
  let submissionApp: INestApplication;
  let gatewayApp: INestApplication;
  let learningStub: Server;
  let captured: Captured = { headers: {} };
  let submissionUrl: string;
  let gatewayUrl: string;
  let consumer: JudgeResultConsumer;
  let expire: ExpireStaleSubmissionsUseCase;
  let relay: RelayAcceptedEventsUseCase;
  let counts: TypeormSubmissionCountReader;
  const student = randomUUID();
  const other = randomUUID();
  const problemId = randomUUID();
  const sources = {
    c: 'int main(){}',
    cpp: 'int main(){}',
    java: 'class Main{}',
    python: 'print(1)',
  };

  async function token(
    sub: string,
    options: { expiresIn?: string; type?: string } = {},
  ): Promise<string> {
    return jwt.signAsync(
      { sub, sid: 'sid-1', jti: randomUUID(), roles: ['STUDENT'], type: options.type ?? 'access' },
      { secret: SECRET, expiresIn: (options.expiresIn ?? '15m') as never },
    );
  }

  async function call(
    base: string,
    method: string,
    path: string,
    options: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
  ): Promise<ApiResult> {
    const headers: Record<string, string> = { ...options.headers };
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(`${base}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const text = await response.text();
    let body: Json;
    try {
      body = JSON.parse(text) as Json;
    } catch {
      body = {};
    }
    return { status: response.status, body, text };
  }

  const gw = (method: string, path: string, options?: Parameters<typeof call>[3]) =>
    call(gatewayUrl, method, path, options);

  const rows = <T = Json>(sql: string, params: unknown[] = []): Promise<T[]> =>
    database.query<T[]>(sql, params);

  const firstRow = <T>(items: readonly T[]): T => {
    const row = items[0];
    if (row === undefined) throw new Error('Expected a database row');
    return row;
  };

  const submitBody = (extra: Json = {}): Json => ({
    problemId,
    language: 'cpp',
    sourceCode: sources.cpp,
    ...extra,
  });
  const runBody = (extra: Json = {}): Json => ({
    language: 'python',
    sourceCode: sources.python,
    stdin: '',
    ...extra,
  });

  async function submitOk(user = student, extra: Json = {}): Promise<string> {
    const result = await gw('POST', '/api/submissions', {
      token: await token(user),
      body: submitBody(extra),
    });
    expect(result.status).toBe(202);
    return result.body.id as string;
  }

  async function feedVerdict(publicId: string, mode: 'RUN' | 'SUBMIT', extra: Json): Promise<void> {
    const row = firstRow(
      await rows<{ id: string }>('SELECT id FROM submissions WHERE public_id = $1', [publicId]),
    );
    await consumer.handleResult({
      executionId: randomUUID(),
      submissionId: row.id,
      mode,
      ...extra,
    });
  }

  beforeAll(async () => {
    if (!testUrl || !new URL(testUrl).pathname.endsWith('_test')) {
      throw new Error('Use an isolated _test database');
    }
    administration = new DataSource({ type: 'postgres', url: testUrl, synchronize: false });
    await administration.initialize();
    await administration.query('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public');
    await administration.query(`CREATE SCHEMA "${schema}"`);
    const entities = [Submission, SubmissionResult, SubmissionAcceptedOutbox];
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: testUrl,
          schema,
          entities,
          extra: { options: `-c search_path=${schema},public` },
          migrations: ['apps/submission-service/src/database/migrations/*.ts'],
          migrationsRun: true,
          synchronize: false,
        }),
        TypeOrmModule.forFeature(entities),
      ],
      controllers: [SubmissionsController, RunCodeController],
      providers: [
        TypeormSubmissionRepository,
        TypeormSubmissionCountReader,
        {
          provide: SubmitCodeUseCase,
          useFactory: (repository: TypeormSubmissionRepository) =>
            new SubmitCodeUseCase(learning, repository, judge),
          inject: [TypeormSubmissionRepository],
        },
        {
          provide: RunCodeUseCase,
          useFactory: (repository: TypeormSubmissionRepository) =>
            new RunCodeUseCase(repository, judge),
          inject: [TypeormSubmissionRepository],
        },
        {
          provide: ListSubmissionHistoryUseCase,
          useFactory: (repository: TypeormSubmissionRepository) =>
            new ListSubmissionHistoryUseCase(repository),
          inject: [TypeormSubmissionRepository],
        },
        {
          provide: GetSubmissionDetailUseCase,
          useFactory: (repository: TypeormSubmissionRepository) =>
            new GetSubmissionDetailUseCase(repository),
          inject: [TypeormSubmissionRepository],
        },
        {
          provide: JudgeResultConsumer,
          useFactory: (repository: TypeormSubmissionRepository) =>
            new JudgeResultConsumer(
              undefined as never,
              new ApplyRunJudgeResultUseCase(repository, realtime),
              new ApplySubmitJudgeResultUseCase(repository, realtime),
            ),
          inject: [TypeormSubmissionRepository],
        },
        {
          provide: ExpireStaleSubmissionsUseCase,
          useFactory: (repository: TypeormSubmissionRepository) =>
            new ExpireStaleSubmissionsUseCase(repository, realtime),
          inject: [TypeormSubmissionRepository],
        },
        {
          provide: RelayAcceptedEventsUseCase,
          useFactory: (repository: TypeormSubmissionRepository) =>
            new RelayAcceptedEventsUseCase(repository, acceptedEvents),
          inject: [TypeormSubmissionRepository],
        },
      ],
    }).compile();
    submissionApp = moduleRef.createNestApplication({ logger: false });
    submissionApp.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await submissionApp.listen(0, '127.0.0.1');
    submissionUrl = await submissionApp.getUrl();
    database = submissionApp.get(DataSource);
    consumer = submissionApp.get(JudgeResultConsumer);
    expire = submissionApp.get(ExpireStaleSubmissionsUseCase);
    relay = submissionApp.get(RelayAcceptedEventsUseCase);
    counts = new TypeormSubmissionCountReader(database);

    learningStub = createServer((request, response) => {
      captured = { method: request.method, url: request.url, headers: request.headers };
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ items: [], total: 0 }));
    });
    await new Promise<void>((resolve) => learningStub.listen(0, '127.0.0.1', resolve));
    const learningUrl = `http://127.0.0.1:${(learningStub.address() as AddressInfo).port}`;

    const gatewayConfig = new ConfigService({
      JWT_ACCESS_SECRET: SECRET,
      CORS_ORIGINS: 'http://localhost:3006',
      IDENTITY_SERVICE_URL: submissionUrl,
      LEARNING_SERVICE_URL: learningUrl,
      SUBMISSION_SERVICE_URL: submissionUrl,
      COMMUNITY_SERVICE_URL: submissionUrl,
    });
    const gatewayModule = await Test.createTestingModule({
      imports: [
        HttpModule,
        JwtModule.register({ global: true }),
        ConfigModule.forRoot({ ignoreEnvFile: true }),
      ],
      controllers: [GatewayProxyController],
      providers: [
        GatewayProxyService,
        GatewayAuthMiddleware,
        {
          provide: GatewaySessionService,
          useValue: { isActive: () => Promise.resolve(sessionActive) },
        },
        { provide: ConfigService, useValue: gatewayConfig },
      ],
    }).compile();
    gatewayApp = gatewayModule.createNestApplication({ logger: false });
    const auth = gatewayApp.get(GatewayAuthMiddleware);
    gatewayApp.use((request: Request, response: Response, next: NextFunction) => {
      void auth.use(request, response, next).catch(next);
    });
    await gatewayApp.listen(0, '127.0.0.1');
    gatewayUrl = await gatewayApp.getUrl();
  }, 60000);

  beforeEach(async () => {
    await database.query(
      'TRUNCATE submission_accepted_outbox, submission_results, submissions CASCADE',
    );
    learning.mode = 'ok';
    learning.disabledLanguages.clear();
    learning.calls = [];
    judge.jobs = [];
    judge.fail = false;
    realtime.sent = [];
    acceptedEvents.events = [];
    sessionActive = true;
    captured = { headers: {} };
  });

  afterAll(async () => {
    await gatewayApp?.close();
    await submissionApp?.close();
    await new Promise((resolve) => (learningStub ? learningStub.close(resolve) : resolve(null)));
    if (administration) {
      await administration.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await administration.destroy();
    }
  });

  describe('Gateway - doc danh sach/chi tiet Problem', () => {
    it('[GW-01] GET /api/problems without a token returns 401 and never reaches Learning', async () => {
      const result = await gw('GET', '/api/problems');
      expect(result.status).toBe(401);
      expect(captured.url).toBeUndefined();
    });

    it('[GW-02] GET /api/problems with a STUDENT token reaches Learning with identity re-derived from the token', async () => {
      const result = await gw('GET', '/api/problems?page=1&limit=5&difficulty=EASY', {
        token: await token(student),
        headers: {
          'x-auth-user-id': 'forged',
          'x-auth-roles': 'ADMIN',
          'x-auth-permissions': 'problem:delete',
        },
      });
      expect(result.status).toBe(200);
      expect(captured.url).toBe('/api/problems?page=1&limit=5&difficulty=EASY');
      expect(captured.headers['x-auth-user-id']).toBe(student);
      expect(captured.headers['x-auth-roles']).toBe('STUDENT');
      expect(captured.headers['x-auth-permissions'] ?? '').toBe('');
    });

    it('[GW-03] GET /api/problems/:slug is forwarded to Learning detail route', async () => {
      const result = await gw('GET', '/api/problems/two-sum', { token: await token(student) });
      expect(result.status).toBe(200);
      expect(captured.method).toBe('GET');
      expect(captured.url).toBe('/api/problems/two-sum');
    });

    it('[GW-04] an expired access token returns 401', async () => {
      const expired = await jwt.signAsync(
        {
          sub: student,
          sid: 's',
          jti: randomUUID(),
          roles: ['STUDENT'],
          type: 'access',
          exp: Math.floor(Date.now() / 1000) - 60,
        },
        { secret: SECRET },
      );
      const result = await gw('GET', '/api/problems', { token: expired });
      expect(result.status).toBe(401);
      expect(captured.url).toBeUndefined();
    });

    it('[GW-05] a revoked session returns 401', async () => {
      sessionActive = false;
      const result = await gw('GET', '/api/problems', { token: await token(student) });
      expect(result.status).toBe(401);
    });

    it('[GW-06] a refresh-type token is not accepted as an access token', async () => {
      const result = await gw('GET', '/api/problems', {
        token: await token(student, { type: 'refresh' }),
      });
      expect(result.status).toBe(401);
    });

    it('[GW-07] internal judge-package and Class/Assignment routes are blocked at the Gateway', async () => {
      const bearer = await token(student);
      for (const path of [
        `/api/problems/${problemId}/judge-package/cpp`,
        '/api/classes',
        '/api/assignments/x',
      ]) {
        const result = await gw('GET', path, { token: bearer });
        expect([403, 404]).toContain(result.status);
      }
      expect(captured.url).toBeUndefined();
    });
  });

  describe('Run code', () => {
    it('[RUN-01] POST /api/run accepts a Run: 202 with the exact public fields, QUEUED row and a fixed-limit job', async () => {
      const result = await gw('POST', '/api/run', { token: await token(student), body: runBody() });
      expect(result.status).toBe(202);
      expect(Object.keys(result.body).sort()).toEqual([
        'createdAt',
        'id',
        'kind',
        'language',
        'status',
      ]);
      expect(result.body).toMatchObject({ kind: 'RUN', status: 'QUEUED', language: 'python' });
      const [row] = await rows<{ kind: string; status: string; user_id: string }>(
        'SELECT kind, status, user_id FROM submissions',
      );
      expect(row).toEqual({ kind: 'RUN', status: 'QUEUED', user_id: student });
      expect(judge.jobs).toHaveLength(1);
      expect(judge.jobs[0]).toMatchObject({ kind: 'RUN', timeLimitMs: 3000, memoryLimitMb: 256 });
    });

    it('[RUN-02] Run with a problemId label does not fetch the Learning judge package and carries no hidden data', async () => {
      const result = await gw('POST', '/api/run', {
        token: await token(student),
        body: runBody({ problemId, stdin: '5\n' }),
      });
      expect(result.status).toBe(202);
      expect(learning.calls).toHaveLength(0);
      expect(JSON.stringify(judge.jobs[0])).not.toContain(SECRET_EXPECTED);
    });

    it('[RUN-03] Run does not count as a submission attempt (count reader and kind filter)', async () => {
      const bearer = await token(student);
      await gw('POST', '/api/run', { token: bearer, body: runBody({ problemId }) });
      await gw('POST', '/api/run', { token: bearer, body: runBody({ problemId }) });
      expect(await counts.count([student], [problemId])).toEqual([]);
      await submitOk();
      expect(await counts.count([student], [problemId])).toEqual([
        { userId: student, problemId, count: 1 },
      ]);
    });

    it('[RUN-04] Run rejects empty source code with 400 and creates no row', async () => {
      const result = await gw('POST', '/api/run', {
        token: await token(student),
        body: runBody({ sourceCode: '' }),
      });
      expect(result.status).toBe(400);
      expect(await rows('SELECT 1 FROM submissions')).toHaveLength(0);
    });

    it('[RUN-05] Run source size boundary: 100000 chars accepted, 100001 rejected with 400', async () => {
      const bearer = await token(student);
      const ok = await gw('POST', '/api/run', {
        token: bearer,
        body: runBody({ sourceCode: 'a'.repeat(100_000) }),
      });
      const tooBig = await gw('POST', '/api/run', {
        token: bearer,
        body: runBody({ sourceCode: 'a'.repeat(100_001) }),
      });
      expect(ok.status).toBe(202);
      expect(tooBig.status).toBe(400);
      expect(await rows('SELECT 1 FROM submissions')).toHaveLength(1);
    });

    it('[RUN-06] Run rejects an unsupported or wrongly cased language with 400', async () => {
      const bearer = await token(student);
      for (const language of ['javascript', 'CPP', '', 'c++']) {
        const result = await gw('POST', '/api/run', { token: bearer, body: runBody({ language }) });
        expect(result.status).toBe(400);
      }
      expect(await rows('SELECT 1 FROM submissions')).toHaveLength(0);
    });

    it('[RUN-07] Run requires stdin as a string (missing or non-string returns 400) and caps it at 100000 chars', async () => {
      const bearer = await token(student);
      const withoutStdin = runBody();
      delete withoutStdin.stdin;
      expect((await gw('POST', '/api/run', { token: bearer, body: withoutStdin })).status).toBe(
        400,
      );
      expect(
        (await gw('POST', '/api/run', { token: bearer, body: runBody({ stdin: 5 }) })).status,
      ).toBe(400);
      expect(
        (
          await gw('POST', '/api/run', {
            token: bearer,
            body: runBody({ stdin: 'x'.repeat(100_001) }),
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await gw('POST', '/api/run', {
            token: bearer,
            body: runBody({ stdin: 'x'.repeat(100_000) }),
          })
        ).status,
      ).toBe(202);
    });

    it('[RUN-08] Run rejects privileged or client-supplied judge fields with 400', async () => {
      const bearer = await token(student);
      for (const extra of [
        { timeLimitMs: 99999 },
        { memoryLimitMb: 99999 },
        { userId: other },
        { status: 'EXECUTED' },
        { testCases: [] },
        { compileCommand: 'rm -rf /' },
      ]) {
        const result = await gw('POST', '/api/run', { token: bearer, body: runBody(extra) });
        expect(result.status).toBe(400);
      }
      expect(await rows('SELECT 1 FROM submissions')).toHaveLength(0);
    });

    it('[RUN-09] Run rejects a malformed problemId with 400', async () => {
      const result = await gw('POST', '/api/run', {
        token: await token(student),
        body: runBody({ problemId: 'abc' }),
      });
      expect(result.status).toBe(400);
    });

    it('[RUN-10] Run without a token returns 401 and creates no row', async () => {
      const result = await gw('POST', '/api/run', { body: runBody() });
      expect(result.status).toBe(401);
      expect(await rows('SELECT 1 FROM submissions')).toHaveLength(0);
    });

    it('[RUN-11] a Judge publish failure turns the Run into INTERNAL_ERROR and returns 500', async () => {
      judge.fail = true;
      const result = await gw('POST', '/api/run', { token: await token(student), body: runBody() });
      expect(result.status).toBe(500);
      const row = firstRow(await rows<{ status: string }>('SELECT status FROM submissions'));
      expect(row.status).toBe('INTERNAL_ERROR');
    });

    it('[RUN-12] a RUN judge result stores EXECUTED and the detail exposes stdout/stderr/runtime to the owner', async () => {
      const bearer = await token(student);
      const id = (await gw('POST', '/api/run', { token: bearer, body: runBody() })).body
        .id as string;
      await feedVerdict(id, 'RUN', {
        status: 'ACCEPTED',
        stdout: 'hello\n',
        stderr: '',
        runtimeMs: 12,
        memoryKb: 2048,
      });
      const detail = await gw('GET', `/api/submissions/${id}`, { token: bearer });
      expect(detail.status).toBe(200);
      expect(detail.body).toMatchObject({
        kind: 'RUN',
        status: 'EXECUTED',
        stdout: 'hello\n',
        runtimeMs: 12,
      });
      expect(realtime.sent.at(-1)).toMatchObject({
        ownerId: student,
        notification: { submissionId: id, kind: 'RUN', status: 'EXECUTED', ready: true },
      });
      expect(acceptedEvents.events).toHaveLength(0);
      expect(await rows('SELECT 1 FROM submission_accepted_outbox')).toHaveLength(0);
    });
  });

  describe('Submit code', () => {
    it('[SUB-01] POST /api/submissions accepts a Submit: 202 allow-listed fields, QUEUED row, job carries the Learning package', async () => {
      const result = await gw('POST', '/api/submissions', {
        token: await token(student),
        body: submitBody(),
      });
      expect(result.status).toBe(202);
      expect(Object.keys(result.body).sort()).toEqual([
        'createdAt',
        'id',
        'kind',
        'language',
        'problemId',
        'status',
      ]);
      expect(result.body).toMatchObject({
        kind: 'SUBMIT',
        status: 'QUEUED',
        problemId,
        language: 'cpp',
      });
      const [row] = await rows<{
        kind: string;
        status: string;
        user_id: string;
        problem_id: string;
      }>('SELECT kind, status, user_id, problem_id FROM submissions');
      expect(row).toEqual({
        kind: 'SUBMIT',
        status: 'QUEUED',
        user_id: student,
        problem_id: problemId,
      });
      expect(learning.calls).toEqual([[problemId, 'cpp']]);
      const job = firstRow(judge.jobs);
      if (!('judgePackage' in job)) throw new Error('Expected a Submit judge job');
      expect(firstRow(job.judgePackage.testCases).expectedOutput).toBe(SECRET_EXPECTED);
    });

    it('[SUB-02] the Submit response and stored row never contain hidden test data', async () => {
      const result = await gw('POST', '/api/submissions', {
        token: await token(student),
        body: submitBody(),
      });
      expect(result.text).not.toContain(SECRET_EXPECTED);
      expect(result.text).not.toContain(SECRET_HARNESS);
      const dump = JSON.stringify(await rows('SELECT * FROM submissions'));
      expect(dump).not.toContain(SECRET_EXPECTED);
      expect(dump).not.toContain(SECRET_HARNESS);
    });

    it('[SUB-03] all four approved languages (c, cpp, java, python) are accepted', async () => {
      const bearer = await token(student);
      for (const language of ['c', 'cpp', 'java', 'python'] as const) {
        const result = await gw('POST', '/api/submissions', {
          token: bearer,
          body: submitBody({ language, sourceCode: sources[language] }),
        });
        expect(result.status).toBe(202);
      }
      expect(await rows('SELECT 1 FROM submissions')).toHaveLength(4);
    });

    it('[SUB-04] an unsupported language returns 400 before Learning is called', async () => {
      const result = await gw('POST', '/api/submissions', {
        token: await token(student),
        body: submitBody({ language: 'ruby' }),
      });
      expect(result.status).toBe(400);
      expect(learning.calls).toHaveLength(0);
    });

    it('[SUB-05] client-supplied judge data, status, score or owner fields are rejected with 400', async () => {
      const bearer = await token(student);
      for (const extra of [
        { testCases: [{ stdin: '1', expectedOutput: '1' }] },
        { expectedOutput: '1' },
        { hiddenHarness: 'x' },
        { timeLimitMs: 1 },
        { memoryLimitMb: 1 },
        { status: 'ACCEPTED' },
        { score: 100 },
        { userId: other },
        { fileName: 'a.cpp' },
        { dockerArgs: ['--privileged'] },
      ]) {
        const result = await gw('POST', '/api/submissions', {
          token: bearer,
          body: submitBody(extra),
        });
        expect(result.status).toBe(400);
      }
      expect(await rows('SELECT 1 FROM submissions')).toHaveLength(0);
      expect(learning.calls).toHaveLength(0);
    });

    it('[SUB-06] a missing or malformed problemId returns 400', async () => {
      const bearer = await token(student);
      const withoutProblem = submitBody();
      delete withoutProblem.problemId;
      expect(
        (await gw('POST', '/api/submissions', { token: bearer, body: withoutProblem })).status,
      ).toBe(400);
      expect(
        (
          await gw('POST', '/api/submissions', {
            token: bearer,
            body: submitBody({ problemId: 'two-sum' }),
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await gw('POST', '/api/submissions', {
            token: bearer,
            body: submitBody({ problemId: '123e4567-e89b-12d3-a456-426614174000' }),
          })
        ).status,
      ).toBe(400);
    });

    it('[SUB-07] source code boundaries: empty and 100001 chars return 400, 100000 chars returns 202', async () => {
      const bearer = await token(student);
      expect(
        (
          await gw('POST', '/api/submissions', {
            token: bearer,
            body: submitBody({ sourceCode: '' }),
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await gw('POST', '/api/submissions', {
            token: bearer,
            body: submitBody({ sourceCode: 'a'.repeat(100_001) }),
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await gw('POST', '/api/submissions', {
            token: bearer,
            body: submitBody({ sourceCode: 'a'.repeat(100_000) }),
          })
        ).status,
      ).toBe(202);
      expect(
        (
          await gw('POST', '/api/submissions', {
            token: bearer,
            body: submitBody({ sourceCode: 5 }),
          })
        ).status,
      ).toBe(400);
    });

    it('[SUB-08] Learning refuses the package (missing/unpublished problem) returns 404 and creates no row or job', async () => {
      learning.mode = 'refuse';
      const result = await gw('POST', '/api/submissions', {
        token: await token(student),
        body: submitBody(),
      });
      expect(result.status).toBe(404);
      expect(await rows('SELECT 1 FROM submissions')).toHaveLength(0);
      expect(judge.jobs).toHaveLength(0);
    });

    it('[SUB-09] a language disabled for the Problem returns 404 and creates no row', async () => {
      learning.disabledLanguages.add('java');
      const result = await gw('POST', '/api/submissions', {
        token: await token(student),
        body: submitBody({ language: 'java', sourceCode: sources.java }),
      });
      expect(result.status).toBe(404);
      expect(await rows('SELECT 1 FROM submissions')).toHaveLength(0);
      const ok = await gw('POST', '/api/submissions', {
        token: await token(student),
        body: submitBody(),
      });
      expect(ok.status).toBe(202);
    });

    it('[SUB-10] Learning unavailable returns 503 and creates no row', async () => {
      learning.mode = 'down';
      const result = await gw('POST', '/api/submissions', {
        token: await token(student),
        body: submitBody(),
      });
      expect(result.status).toBe(503);
      expect(await rows('SELECT 1 FROM submissions')).toHaveLength(0);
    });

    it('[SUB-11] a Judge publish failure leaves an INTERNAL_ERROR record that still appears in history', async () => {
      judge.fail = true;
      const bearer = await token(student);
      const result = await gw('POST', '/api/submissions', { token: bearer, body: submitBody() });
      expect(result.status).toBe(500);
      const history = await gw('GET', '/api/submissions', { token: bearer });
      expect(history.status).toBe(200);
      const items = history.body.items as Json[];
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ kind: 'SUBMIT', status: 'INTERNAL_ERROR' });
    });

    it('[SUB-12] Submit without a token returns 401 and creates no row', async () => {
      const result = await gw('POST', '/api/submissions', { body: submitBody() });
      expect(result.status).toBe(401);
      expect(await rows('SELECT 1 FROM submissions')).toHaveLength(0);
    });

    it('[SUB-13] a forged x-auth-user-id header cannot choose the owner; the owner comes from the token', async () => {
      const result = await gw('POST', '/api/submissions', {
        token: await token(student),
        headers: { 'x-auth-user-id': other },
        body: submitBody(),
      });
      expect(result.status).toBe(202);
      const row = firstRow(await rows<{ user_id: string }>('SELECT user_id FROM submissions'));
      expect(row.user_id).toBe(student);
    });

    it('[SUB-14] calling the Submission service directly without the trusted owner header returns 401', async () => {
      const result = await call(submissionUrl, 'POST', '/api/submissions', { body: submitBody() });
      expect(result.status).toBe(401);
      const dup = await call(submissionUrl, 'GET', '/api/submissions', {
        headers: { 'x-auth-user-id': 'not-a-uuid' },
      });
      expect(dup.status).toBe(401);
    });

    it('[SUB-15] resubmitting the same body creates a new record each time and every record counts as one attempt', async () => {
      const first = await submitOk();
      const second = await submitOk();
      const third = await submitOk();
      expect(new Set([first, second, third]).size).toBe(3);
      expect(await counts.count([student], [problemId])).toEqual([
        { userId: student, problemId, count: 3 },
      ]);
    });

    it('[SUB-16] Submission service imposes no per-user rate limit: 30 consecutive submits are all accepted (SUB-002 v1)', async () => {
      const bearer = await token(student);
      for (let index = 0; index < 30; index += 1) {
        const result = await gw('POST', '/api/submissions', { token: bearer, body: submitBody() });
        expect(result.status).toBe(202);
      }
      expect(await counts.count([student], [problemId])).toEqual([
        { userId: student, problemId, count: 30 },
      ]);
    });
  });

  describe('Judge results', () => {
    it('[VER-01] ACCEPTED: record becomes ACCEPTED, one outbox row, realtime to the owner, relay publishes the six-field event with score 100', async () => {
      const id = await submitOk();
      await feedVerdict(id, 'SUBMIT', {
        status: 'ACCEPTED',
        score: 0,
        passedTests: 3,
        totalTests: 3,
        runtimeMs: 5,
        memoryKb: 1024,
      });
      const detail = await gw('GET', `/api/submissions/${id}`, { token: await token(student) });
      expect(detail.body).toMatchObject({ status: 'ACCEPTED', passedTests: 3, totalTests: 3 });
      expect(await rows('SELECT 1 FROM submission_accepted_outbox')).toHaveLength(1);
      expect(realtime.sent).toHaveLength(1);
      expect(realtime.sent[0]).toMatchObject({
        ownerId: student,
        notification: { kind: 'SUBMIT', status: 'ACCEPTED', ready: true },
      });
      expect(await relay.execute()).toBe(1);
      expect(acceptedEvents.events).toHaveLength(1);
      expect(acceptedEvents.events[0]).toMatchObject({ userId: student, problemId, score: 100 });
      expect(Object.keys(firstRow(acceptedEvents.events)).sort()).toEqual([
        'eventId',
        'occurredAt',
        'problemId',
        'score',
        'submissionId',
        'userId',
      ]);
    });

    it('[VER-02] WRONG_ANSWER keeps partial test counts and queues no accepted event', async () => {
      const id = await submitOk();
      await feedVerdict(id, 'SUBMIT', {
        status: 'WRONG_ANSWER',
        score: 40,
        passedTests: 2,
        totalTests: 5,
      });
      const detail = await gw('GET', `/api/submissions/${id}`, { token: await token(student) });
      expect(detail.body).toMatchObject({
        status: 'WRONG_ANSWER',
        score: 40,
        passedTests: 2,
        totalTests: 5,
      });
      expect(await rows('SELECT 1 FROM submission_accepted_outbox')).toHaveLength(0);
    });

    it('[VER-03] COMPILE_ERROR exposes the line, column, message and compile output to the owner', async () => {
      const id = await submitOk();
      await feedVerdict(id, 'SUBMIT', {
        status: 'COMPILE_ERROR',
        compileOutput: 'main.cpp:3:5: error: expected ;',
        error: { line: 3, column: 5, message: 'expected ;' },
      });
      const detail = await gw('GET', `/api/submissions/${id}`, { token: await token(student) });
      expect(detail.body).toMatchObject({
        status: 'COMPILE_ERROR',
        compileOutput: 'main.cpp:3:5: error: expected ;',
        error: { line: 3, column: 5, message: 'expected ;' },
      });
    });

    it('[VER-04] RUNTIME_ERROR, TIME_LIMIT_EXCEEDED and MEMORY_LIMIT_EXCEEDED verdicts are stored as terminal states without events', async () => {
      const bearer = await token(student);
      for (const status of ['RUNTIME_ERROR', 'TIME_LIMIT_EXCEEDED', 'MEMORY_LIMIT_EXCEEDED']) {
        const id = await submitOk();
        await feedVerdict(id, 'SUBMIT', { status, passedTests: 1, totalTests: 4 });
        const detail = await gw('GET', `/api/submissions/${id}`, { token: bearer });
        expect(detail.body).toMatchObject({ status });
      }
      expect(await rows('SELECT 1 FROM submission_accepted_outbox')).toHaveLength(0);
    });

    it('[VER-05] a Judge INTERNAL_ERROR is stored as terminal and queues no accepted event', async () => {
      const id = await submitOk();
      await feedVerdict(id, 'SUBMIT', { status: 'INTERNAL_ERROR', score: 100 });
      const detail = await gw('GET', `/api/submissions/${id}`, { token: await token(student) });
      expect(detail.body).toMatchObject({ status: 'INTERNAL_ERROR' });
      expect(await rows('SELECT 1 FROM submission_accepted_outbox')).toHaveLength(0);
    });

    it('[VER-06] a redelivered ACCEPTED result is idempotent: one outbox row, one result row, one notification', async () => {
      const id = await submitOk();
      const payload = { status: 'ACCEPTED', passedTests: 1, totalTests: 1 };
      await feedVerdict(id, 'SUBMIT', payload);
      await feedVerdict(id, 'SUBMIT', payload);
      expect(await rows('SELECT 1 FROM submission_accepted_outbox')).toHaveLength(1);
      expect(await rows('SELECT 1 FROM submission_results')).toHaveLength(1);
      expect(realtime.sent).toHaveLength(1);
    });

    it('[VER-07] a late conflicting verdict never overwrites a terminal state', async () => {
      const id = await submitOk();
      await feedVerdict(id, 'SUBMIT', { status: 'WRONG_ANSWER', passedTests: 0, totalTests: 2 });
      await feedVerdict(id, 'SUBMIT', { status: 'ACCEPTED', passedTests: 2, totalTests: 2 });
      const detail = await gw('GET', `/api/submissions/${id}`, { token: await token(student) });
      expect(detail.body).toMatchObject({ status: 'WRONG_ANSWER' });
      expect(await rows('SELECT 1 FROM submission_accepted_outbox')).toHaveLength(0);
    });

    it('[VER-08] a SUBMIT-mode result addressed to a Run (and vice versa) is ignored', async () => {
      const bearer = await token(student);
      const runId = (await gw('POST', '/api/run', { token: bearer, body: runBody() })).body
        .id as string;
      await feedVerdict(runId, 'SUBMIT', { status: 'ACCEPTED' });
      const detail = await gw('GET', `/api/submissions/${runId}`, { token: bearer });
      expect(detail.body).toMatchObject({ kind: 'RUN', status: 'QUEUED' });
      expect(await rows('SELECT 1 FROM submission_accepted_outbox')).toHaveLength(0);
    });

    it('[VER-09] malformed payloads, unknown statuses and unknown submissions are rejected so the delivery is dead-lettered', async () => {
      const id = await submitOk();
      const row = firstRow(
        await rows<{ id: string }>('SELECT id FROM submissions WHERE public_id = $1', [id]),
      );
      await expect(consumer.handleResult({ foo: 'bar' })).rejects.toThrow();
      await expect(
        consumer.handleResult({
          executionId: 'e',
          submissionId: row.id,
          mode: 'SUBMIT',
          status: 'EXECUTED',
        }),
      ).rejects.toThrow();
      await expect(
        consumer.handleResult({
          executionId: 'e',
          submissionId: randomUUID(),
          mode: 'SUBMIT',
          status: 'ACCEPTED',
        }),
      ).rejects.toThrow();
      const after = await rows<{ status: string }>('SELECT status FROM submissions');
      expect(firstRow(after).status).toBe('QUEUED');
    });

    it('[VER-10] the watchdog moves a PENDING/QUEUED record older than 10 minutes to INTERNAL_ERROR and notifies the owner', async () => {
      const id = await submitOk();
      expect(await expire.execute(new Date(Date.now() + 9 * 60_000))).toBe(0);
      expect(await expire.execute(new Date(Date.now() + 11 * 60_000))).toBe(1);
      const detail = await gw('GET', `/api/submissions/${id}`, { token: await token(student) });
      expect(detail.body).toMatchObject({ status: 'INTERNAL_ERROR' });
      expect(realtime.sent.at(-1)).toMatchObject({
        ownerId: student,
        notification: { status: 'INTERNAL_ERROR' },
      });
      await feedVerdict(id, 'SUBMIT', { status: 'ACCEPTED' });
      expect(
        (await gw('GET', `/api/submissions/${id}`, { token: await token(student) })).body,
      ).toMatchObject({ status: 'INTERNAL_ERROR' });
    });
  });

  describe('History and detail', () => {
    it('[HIS-01] GET /api/submissions lists only the caller records, newest first, with total and no internal fields', async () => {
      const bearer = await token(student);
      const first = await submitOk();
      const second = await submitOk();
      await submitOk(other);
      const result = await gw('GET', '/api/submissions', { token: bearer });
      expect(result.status).toBe(200);
      const items = result.body.items as Json[];
      expect(items.map((item) => item.id)).toEqual([second, first]);
      expect(result.body.total).toBe(2);
      for (const item of items) {
        expect(item).not.toHaveProperty('sourceCode');
        expect(item).not.toHaveProperty('stdout');
        expect(item).not.toHaveProperty('userId');
      }
      expect(result.text).not.toContain(SECRET_EXPECTED);
    });

    it('[HIS-02] history filters by kind and by problemId', async () => {
      const bearer = await token(student);
      await submitOk();
      await submitOk(student, { problemId: randomUUID() });
      await gw('POST', '/api/run', { token: bearer, body: runBody() });
      const submits = await gw('GET', '/api/submissions?kind=SUBMIT', { token: bearer });
      const runs = await gw('GET', '/api/submissions?kind=RUN', { token: bearer });
      const byProblem = await gw('GET', `/api/submissions?problemId=${problemId}`, {
        token: bearer,
      });
      expect((submits.body.items as Json[]).length).toBe(2);
      expect((runs.body.items as Json[]).length).toBe(1);
      expect((byProblem.body.items as Json[]).length).toBe(1);
    });

    it('[HIS-03] cursor pagination with limit=2 walks 5 records without gaps or duplicates', async () => {
      const bearer = await token(student);
      const created: string[] = [];
      for (let index = 0; index < 5; index += 1) created.unshift(await submitOk());
      const seen: string[] = [];
      let path = '/api/submissions?limit=2';
      for (let page = 0; page < 5 && path; page += 1) {
        const result = await gw('GET', path, { token: bearer });
        expect(result.status).toBe(200);
        seen.push(...(result.body.items as Json[]).map((item) => item.id as string));
        const next = result.body.nextCursor as { createdAt: string; publicId: string } | null;
        path = next
          ? `/api/submissions?limit=2&cursor=${encodeURIComponent(next.createdAt)}&cursorId=${next.publicId}`
          : '';
      }
      expect(seen).toEqual(created);
    });

    it('[HIS-04] invalid history queries return 400: limit 0/101/abc, half cursor, unknown kind, bad problemId, owner parameter', async () => {
      const bearer = await token(student);
      for (const query of [
        'limit=0',
        'limit=101',
        'limit=abc',
        'cursor=2026-01-01T00:00:00.000Z',
        `cursorId=${randomUUID()}`,
        'kind=OTHER',
        'problemId=abc',
        `userId=${other}`,
        `ownerId=${other}`,
      ]) {
        const result = await gw('GET', `/api/submissions?${query}`, { token: bearer });
        expect({ query, status: result.status }).toEqual({ query, status: 400 });
      }
    });

    it('[HIS-05] an empty history returns 200 with no items and total 0', async () => {
      const result = await gw('GET', '/api/submissions', { token: await token(student) });
      expect(result.status).toBe(200);
      expect(result.body).toMatchObject({ items: [], total: 0 });
    });

    it('[HIS-06] GET /api/submissions without a token returns 401', async () => {
      expect((await gw('GET', '/api/submissions')).status).toBe(401);
    });

    it('[HIS-07] Submit detail returns source code and verdict to the owner but no stdout/stderr and no hidden data', async () => {
      const bearer = await token(student);
      const id = await submitOk();
      await feedVerdict(id, 'SUBMIT', {
        status: 'WRONG_ANSWER',
        stdout: 'SENSITIVE_STDOUT',
        stderr: 'SENSITIVE_STDERR',
        passedTests: 1,
        totalTests: 2,
      });
      const detail = await gw('GET', `/api/submissions/${id}`, { token: bearer });
      expect(detail.status).toBe(200);
      expect(detail.body).toMatchObject({
        id,
        kind: 'SUBMIT',
        problemId,
        language: 'cpp',
        sourceCode: sources.cpp,
        sourceCodeSize: sources.cpp.length,
      });
      expect(detail.body).not.toHaveProperty('stdout');
      expect(detail.body).not.toHaveProperty('stderr');
      expect(detail.text).not.toContain('SENSITIVE_STDOUT');
      expect(detail.text).not.toContain(SECRET_EXPECTED);
      expect(detail.text).not.toContain(SECRET_HARNESS);
    });

    it("[HIS-08] another user's detail returns 404, identical to a missing id", async () => {
      const id = await submitOk();
      const foreign = await gw('GET', `/api/submissions/${id}`, { token: await token(other) });
      const missing = await gw('GET', `/api/submissions/${randomUUID()}`, {
        token: await token(other),
      });
      expect(foreign.status).toBe(404);
      expect(missing.status).toBe(404);
      expect(foreign.body).toEqual(missing.body);
    });

    it('[HIS-09] detail with a non-UUID-v4 id returns 400', async () => {
      const bearer = await token(student);
      expect((await gw('GET', '/api/submissions/abc', { token: bearer })).status).toBe(400);
      expect(
        (
          await gw('GET', '/api/submissions/123e4567-e89b-12d3-a456-426614174000', {
            token: bearer,
          })
        ).status,
      ).toBe(400);
    });

    it('[HIS-10] submissions are immutable through the API: PUT/PATCH/DELETE on a submission are blocked', async () => {
      const bearer = await token(student);
      const id = await submitOk();
      for (const method of ['PUT', 'PATCH', 'DELETE']) {
        const result = await gw(method, `/api/submissions/${id}`, {
          token: bearer,
          body: method === 'DELETE' ? undefined : { sourceCode: 'x' },
        });
        expect([403, 404, 405]).toContain(result.status);
      }
      const row = firstRow(
        await rows<{ source_code: string }>('SELECT source_code FROM submissions'),
      );
      expect(row.source_code).toBe(sources.cpp);
    });
  });
});
