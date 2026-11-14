import { BUILD_JUDGE_PACKAGE_PORT_IN } from '@learning/modules/problems/application/ports/in/build-judge-package.port.in';
import { ProblemsController } from '@learning/modules/problems/problems.controller';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';

import {
  createProblemPayload,
  createProblemsTestApp,
  HIDDEN_EXPECTED_OUTPUT,
  ADMIN_A_ID,
  adminHeaders,
  principalHeaders,
  studentHeaders,
  type ProblemsTestApp,
} from './testing/problems-e2e.harness';

const INTERNAL_SECRET = 'test-internal-secret';
const PROBLEM_ID = '00000000-0000-4000-8000-000000000051';

interface ApiResponse {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

function asObject(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error(`Expected a string, received ${typeof value}`);
  }

  return value;
}

describe('Problems API security contract', () => {
  let harness: ProblemsTestApp;

  beforeAll(async () => {
    harness = await createProblemsTestApp();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(() => {
    harness.problems.clear();
    harness.testCases.clear();
  });

  async function send(path: string, init: RequestInit): Promise<ApiResponse> {
    const response = await fetch(`${harness.baseUrl}${path}`, init);
    const body = asObject(await response.json());

    return { status: response.status, body };
  }

  function post(path: string, body: unknown, headers = adminHeaders()): Promise<ApiResponse> {
    return send(path, { method: 'POST', headers, body: JSON.stringify(body) });
  }

  function patch(path: string, body: unknown, headers = adminHeaders()): Promise<ApiResponse> {
    return send(path, { method: 'PATCH', headers, body: JSON.stringify(body) });
  }

  async function createDraft(overrides: Record<string, unknown> = {}): Promise<string> {
    const response = await post('/api/problems', createProblemPayload(overrides));
    expect(response.status).toBe(201);

    return text(response.body.id);
  }

  it('rejects mass assignment of ownership and status fields on create', async () => {
    const response = await post('/api/problems', {
      ...createProblemPayload(),
      id: PROBLEM_ID,
      createdBy: ADMIN_A_ID,
      publishStatus: 'PUBLISHED',
      deletedAt: new Date().toISOString(),
    });

    expect(response.status).toBe(400);
    expect(harness.problems.storedSnapshot(PROBLEM_ID)).toBeUndefined();

    const managed = await send('/api/problems/managed', { headers: adminHeaders() });
    expect(managed.body.total).toBe(0);
  });

  it('rejects mass assignment of immutable fields on update', async () => {
    const id = await createDraft();

    const response = await patch(`/api/problems/${id}`, {
      title: 'Changed',
      slug: 'hijacked-slug',
      createdBy: ADMIN_A_ID,
      publishStatus: 'PUBLISHED',
      deletedAt: new Date().toISOString(),
    });

    expect(response.status).toBe(400);
    expect(harness.problems.storedSnapshot(id)?.title.value).toBe('Two Sum');
    expect(harness.problems.storedSnapshot(id)?.slug.value).toBe('two-sum');
    expect(harness.problems.storedSnapshot(id)?.publishStatus).toBe('DRAFT');
  });

  it('rejects duplicate identity headers instead of trusting the last one', async () => {
    const headers = new Headers();
    headers.append('content-type', 'application/json');
    headers.append('x-auth-user-id', ADMIN_A_ID);
    headers.append('x-auth-user-id', ADMIN_A_ID);
    headers.append('x-auth-roles', 'ADMIN');
    headers.append('x-auth-permissions', 'problem:create');

    const response = await fetch(`${harness.baseUrl}/api/problems`, {
      method: 'POST',
      headers,
      body: JSON.stringify(createProblemPayload()),
    });

    expect(response.status).toBe(401);
  });

  it('rejects malformed identity and role headers', async () => {
    const nonUuid = await send('/api/problems', {
      headers: principalHeaders('not-a-uuid', 'ADMIN', 'problem:create'),
    });
    expect(nonUuid.status).toBe(401);

    const lowercaseRole = await send('/api/problems', {
      headers: principalHeaders(ADMIN_A_ID, 'admin', 'problem:create'),
    });
    expect(lowercaseRole.status).toBe(401);

    const malformedPermission = await send('/api/problems', {
      headers: principalHeaders(ADMIN_A_ID, 'ADMIN', 'not-a-permission'),
    });
    expect(malformedPermission.status).toBe(401);
  });

  it('rejects a admin without the required permission', async () => {
    const response = await post(
      '/api/problems',
      createProblemPayload(),
      principalHeaders(ADMIN_A_ID, 'ADMIN', 'problem:read-managed'),
    );

    expect(response.status).toBe(403);
  });

  it('requires authentication on public endpoints', async () => {
    const list = await send('/api/problems', {});
    expect(list.status).toBe(401);

    const detail = await send('/api/problems/two-sum', {});
    expect(detail.status).toBe(401);
  });

  it('does not persist partial state when a domain validation fails', async () => {
    const id = await createDraft();

    const response = await patch(`/api/problems/${id}`, { title: '' });

    expect(response.status).toBe(400);
    expect(harness.problems.storedSnapshot(id)?.title.value).toBe('Two Sum');
    expect(harness.problems.storedSnapshot(id)?.updatedAt).toEqual(
      harness.problems.storedSnapshot(id)?.createdAt,
    );
  });

  it('never exposes hidden judge data on public or managed projections', async () => {
    harness.testCases.setHiddenExpectedOutputs([HIDDEN_EXPECTED_OUTPUT]);
    harness.testCases.setSamples([{ input: '1 2', expectedOutput: '3', displayOrder: 0 }]);

    const id = await createDraft();
    expect((await post(`/api/problems/${id}/publish`, {})).status).toBe(200);

    const publicDetail = await send(`/api/problems/${id}`, { headers: studentHeaders() });
    expect(publicDetail.status).toBe(200);
    expect(JSON.stringify(publicDetail.body)).not.toContain(HIDDEN_EXPECTED_OUTPUT);

    const managedDetail = await send(`/api/problems/managed/${id}`, {
      headers: adminHeaders(),
    });
    expect(managedDetail.status).toBe(200);
    expect(JSON.stringify(managedDetail.body)).not.toContain(HIDDEN_EXPECTED_OUTPUT);

    for (const body of [publicDetail.body, managedDetail.body]) {
      const serialized = JSON.stringify(body);

      for (const forbidden of [
        'hiddenHarness',
        'hidden_harness',
        'judgePackage',
        'compilationCommand',
        'dockerImage',
        'visibility',
      ]) {
        expect(serialized).not.toContain(forbidden);
      }
    }
  });

  it('does not leak hidden data through error responses', async () => {
    harness.testCases.setHiddenExpectedOutputs([HIDDEN_EXPECTED_OUTPUT]);
    const id = await createDraft({ enabledLanguages: [] });

    const response = await post(`/api/problems/${id}/publish`, {});

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).not.toContain(HIDDEN_EXPECTED_OUTPUT);
    expect(Object.keys(response.body).sort()).toEqual([
      'code',
      'details',
      'message',
      'requestId',
      'statusCode',
    ]);
  });
});

describe('Internal judge package endpoint security contract', () => {
  let app: NestExpressApplication;
  let baseUrl: string;
  const buildJudgePackage = { execute: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProblemsController],
      providers: [
        { provide: BUILD_JUDGE_PACKAGE_PORT_IN, useValue: buildJudgePackage },
        {
          provide: ConfigService,
          useValue: { getOrThrow: () => INTERNAL_SECRET },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    await app.listen(0, '127.0.0.1');

    const address = (
      app.getHttpServer() as { address(): { port: number } | string | null }
    ).address();

    if (address === null || typeof address === 'string') {
      throw new Error('Expected an ephemeral TCP port');
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    buildJudgePackage.execute.mockReset();
    buildJudgePackage.execute.mockResolvedValue({
      problemId: PROBLEM_ID,
      language: 'python',
      files: [],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const path = `/internal/problems/${PROBLEM_ID}/judge-package/python`;

  it('rejects requests without the internal service secret', async () => {
    const response = await fetch(`${baseUrl}${path}`, { headers: studentHeaders() });

    expect(response.status).toBe(401);
    expect(buildJudgePackage.execute).not.toHaveBeenCalled();
  });

  it('rejects requests with a wrong internal service secret', async () => {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { 'x-internal-service-secret': 'wrong-secret' },
    });

    expect(response.status).toBe(401);
    expect(buildJudgePackage.execute).not.toHaveBeenCalled();
  });

  it('allows the judge service with the configured secret', async () => {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { 'x-internal-service-secret': INTERNAL_SECRET },
    });

    expect(response.status).toBe(200);
    expect(buildJudgePackage.execute).toHaveBeenCalledWith(PROBLEM_ID, 'python');
    expect(asObject(await response.json()).problemId).toBe(PROBLEM_ID);
  });
});
