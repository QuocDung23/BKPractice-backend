import type { AddressInfo } from 'node:net';

import { ForbiddenError } from '@learning/modules/problems/application/errors/forbidden.error';
import { PublishNotReadyError } from '@learning/modules/problems/application/errors/publish-not-ready.error';
import { ADD_TEST_CASE_PORT_IN } from '@learning/modules/problems/application/ports/in/add-test-case.port.in';
import { GET_HARNESS_PORT_IN } from '@learning/modules/problems/application/ports/in/get-harness.port.in';
import { GET_TEST_CASE_PORT_IN } from '@learning/modules/problems/application/ports/in/get-test-case.port.in';
import { LIST_TEST_CASES_PORT_IN } from '@learning/modules/problems/application/ports/in/list-test-cases.port.in';
import { REMOVE_HARNESS_PORT_IN } from '@learning/modules/problems/application/ports/in/remove-harness.port.in';
import { REMOVE_TEST_CASE_PORT_IN } from '@learning/modules/problems/application/ports/in/remove-test-case.port.in';
import { REORDER_TEST_CASES_PORT_IN } from '@learning/modules/problems/application/ports/in/reorder-test-cases.port.in';
import { SET_HARNESS_PORT_IN } from '@learning/modules/problems/application/ports/in/set-harness.port.in';
import { UPDATE_TEST_CASE_PORT_IN } from '@learning/modules/problems/application/ports/in/update-test-case.port.in';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';

import { ManagedTestCasesController } from './managed-test-cases.controller';
import { ProblemRequestMapper } from './mappers/problem-request.mapper';

const PROBLEM_ID = '00000000-0000-4000-8000-000000000001';
const CASE_ID = '00000000-0000-4000-8000-000000000011';
const USER_ID = '00000000-0000-4000-8000-000000000031';
const AUTH_HEADERS = {
  'content-type': 'application/json',
  'x-auth-user-id': USER_ID,
  'x-auth-roles': 'ADMIN',
  'x-auth-permissions': 'problem:update,problem:read-managed',
};

describe('ManagedTestCasesController HTTP contract', () => {
  let app: NestExpressApplication;
  let baseUrl: string;
  const useCases = {
    add: { execute: jest.fn() },
    update: { execute: jest.fn() },
    remove: { execute: jest.fn() },
    reorder: { execute: jest.fn() },
    list: { execute: jest.fn() },
    get: { execute: jest.fn() },
    setHarness: { execute: jest.fn() },
    removeHarness: { execute: jest.fn() },
    getHarness: { execute: jest.fn() },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ManagedTestCasesController],
      providers: [
        ProblemRequestMapper,
        { provide: ADD_TEST_CASE_PORT_IN, useValue: useCases.add },
        { provide: UPDATE_TEST_CASE_PORT_IN, useValue: useCases.update },
        { provide: REMOVE_TEST_CASE_PORT_IN, useValue: useCases.remove },
        { provide: REORDER_TEST_CASES_PORT_IN, useValue: useCases.reorder },
        { provide: LIST_TEST_CASES_PORT_IN, useValue: useCases.list },
        { provide: GET_TEST_CASE_PORT_IN, useValue: useCases.get },
        { provide: SET_HARNESS_PORT_IN, useValue: useCases.setHarness },
        { provide: REMOVE_HARNESS_PORT_IN, useValue: useCases.removeHarness },
        { provide: GET_HARNESS_PORT_IN, useValue: useCases.getHarness },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    app.useBodyParser('json', { limit: '4mb' });
    await app.listen(0, '127.0.0.1');

    const address = (app.getHttpServer() as { address(): AddressInfo | string | null }).address();

    if (address === null || typeof address === 'string') {
      throw new Error('Expected an ephemeral TCP port');
    }

    baseUrl = `http://127.0.0.1:${address.port}/api/problems`;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects a request without a trusted principal before touching a use case', async () => {
    const response = await fetch(`${baseUrl}/${PROBLEM_ID}/test-cases`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expectedOutput: '3', score: 5 }),
    });

    expect(response.status).toBe(401);
    expect(useCases.add.execute).not.toHaveBeenCalled();
  });

  it('rejects unknown body fields through the global ValidationPipe', async () => {
    const response = await fetch(`${baseUrl}/${PROBLEM_ID}/test-cases`, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ expectedOutput: '3', score: 5, problemId: PROBLEM_ID }),
    });

    expect(response.status).toBe(400);
    expect(useCases.add.execute).not.toHaveBeenCalled();
  });

  it('accepts the managed harness route with both id and language params', async () => {
    useCases.getHarness.execute.mockResolvedValue({ language: 'python', source: 'harness' });

    const response = await fetch(`${baseUrl}/managed/${PROBLEM_ID}/harnesses/python`, {
      headers: AUTH_HEADERS,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ language: 'python', source: 'harness' });
  });

  it('maps a forbidden use case failure to 403', async () => {
    useCases.list.execute.mockRejectedValue(new ForbiddenError());

    const response = await fetch(`${baseUrl}/managed/${PROBLEM_ID}/test-cases`, {
      headers: AUTH_HEADERS,
    });

    expect(response.status).toBe(403);
  });

  it('maps a lost readiness condition to 400 with the issue list', async () => {
    useCases.remove.execute.mockRejectedValue(
      new PublishNotReadyError([
        {
          code: 'TEST_CASE_HIDDEN_REQUIRED',
          field: 'testCases',
          message: 'A problem requires at least one hidden test case',
        },
      ]),
    );

    const response = await fetch(`${baseUrl}/${PROBLEM_ID}/test-cases/${CASE_ID}`, {
      method: 'DELETE',
      headers: AUTH_HEADERS,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      statusCode: 400,
      code: 'PROBLEM_NOT_READY_TO_PUBLISH',
      message: 'Bài tập chưa đủ điều kiện xuất bản: còn 1 mục cần hoàn thiện.',
      details: [
        {
          code: 'TEST_CASE_HIDDEN_REQUIRED',
          field: 'testCases',
          message: 'Cần có ít nhất một test case ẩn. (trường "testCases")',
        },
      ],
    });
  });
});
