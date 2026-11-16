import type { INestApplication } from '@nestjs/common';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import {
  RBAC_REPOSITORY,
  RBAC_TRANSACTION_RUNNER,
  type RbacRepository,
  type TransactionRunner,
} from '@/modules/rbac/application';
import { RoleName } from '@/modules/rbac/domain';
import { RbacModule } from '@/modules/rbac/rbac.module';

const adminId = '00000000-0000-4000-8000-000000000001';
const targetId = '00000000-0000-4000-8000-000000000002';
const missingId = '00000000-0000-4000-8000-000000000004';
const secret = 'a'.repeat(32);

describe('RBAC HTTP and module contract (ID-003 AC-002–AC-015)', () => {
  let app: INestApplication;
  let url: string;
  let assignments: Map<string, Set<RoleName>>;
  let adminToken: string;
  const jwt = new JwtService();
  let logs: jest.SpyInstance;
  let warnings: jest.SpyInstance;
  const repository: RbacRepository = {
    findUserRoles: async (userId) => {
      const roles = assignments.get(userId);
      return roles ? { userId, roles: [...roles].sort() } : null;
    },
    lockUser: async () => undefined,
    recordRoleAudit: async () => undefined,
    assignRole: async (userId, role) => {
      assignments.get(userId)?.add(role);
    },
    revokeRole: async (userId, role) => {
      assignments.get(userId)?.delete(role);
    },
    lockAdminRole: async () => undefined,
    countAdmins: async () =>
      [...assignments.values()].filter((roles) => roles.has(RoleName.Admin)).length,
  };
  const transactions: TransactionRunner = { run: (operation) => operation(repository) };

  function sign(roles: string[], extra: Record<string, unknown> = {}): Promise<string> {
    return jwt.signAsync(
      {
        sub: adminId,
        sid: '00000000-0000-4000-8000-000000000010',
        jti: '00000000-0000-4000-8000-000000000011',
        roles,
        type: 'access',
        ...extra,
      },
      { secret, expiresIn: '15m' },
    );
  }

  async function request(
    method: string,
    path: string,
    token?: string,
    body?: unknown,
    headers = {},
  ): Promise<Response> {
    return fetch(`${url}/api/roles${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  beforeAll(async () => {
    logs = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warnings = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ JWT_ACCESS_SECRET: secret })],
        }),
        JwtModule.register({ global: true }),
        RbacModule,
      ],
    })
      .overrideProvider(RBAC_REPOSITORY)
      .useValue(repository)
      .overrideProvider(RBAC_TRANSACTION_RUNNER)
      .useValue(transactions)
      .useMocker((token) => (token === DataSource ? { manager: {} } : undefined))
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
    adminToken = await sign([RoleName.Admin]);
  });

  beforeEach(() => {
    assignments = new Map<string, Set<RoleName>>([
      [adminId, new Set([RoleName.Admin])],
      [targetId, new Set([RoleName.Student])],
    ]);
  });

  afterAll(async () => {
    await app?.close();
    logs.mockRestore();
    warnings.mockRestore();
  });

  it('preserves correlation IDs and logs only coarse role outcomes (AC-015)', async () => {
    logs.mockClear();
    warnings.mockClear();
    const headers = { 'x-request-id': 'rbac-test-request' };
    const response = await request('GET', `/users/${targetId}`, adminToken, undefined, headers);
    expect(response.headers.get('x-request-id')).toBe('rbac-test-request');
    await request(
      'POST',
      `/users/${targetId}`,
      adminToken,
      { role: 'ADMIN', reason: 'Test role change' },
      headers,
    );
    expect(logs).toHaveBeenCalledWith({
      operation: 'GET',
      outcome: 'success',
      requestId: 'rbac-test-request',
    });
    expect(logs).toHaveBeenCalledWith({
      operation: 'POST',
      outcome: 'success',
      requestId: 'rbac-test-request',
    });
  });

  it('rejects forged headers without Bearer, bad signatures, expired and wrong-purpose tokens', async () => {
    expect(
      (
        await request('GET', `/users/${targetId}`, undefined, undefined, {
          'x-auth-user-id': adminId,
          'x-auth-roles': 'ADMIN',
        })
      ).status,
    ).toBe(401);
    for (const token of [
      await sign([RoleName.Admin], { type: 'refresh' }),
      await sign([RoleName.Admin], { type: 'microsoft' }),
      await sign(['SUPER_ADMIN']),
      await jwt.signAsync({ sub: adminId, roles: ['ADMIN'], type: 'access' }, { secret: 'wrong' }),
      await jwt.signAsync({ sub: adminId, roles: ['ADMIN'], type: 'access', exp: 1 }, { secret }),
    ]) {
      expect((await request('GET', `/users/${targetId}`, token)).status).toBe(401);
    }
  });

  it.each([RoleName.Student, RoleName.Lecturer])(
    'rejects %s privilege escalation despite forged metadata',
    async (role) => {
      const token = await sign([role]);
      expect(
        (
          await request(
            'POST',
            `/users/${adminId}`,
            token,
            { role: 'LECTURER', reason: 'Test role change' },
            { 'x-auth-roles': 'ADMIN' },
          )
        ).status,
      ).toBe(403);
      expect([...assignments.get(adminId)!]).toEqual([RoleName.Admin]);
    },
  );

  it('allows idempotent role changes with safe response data only', async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await request('POST', `/users/${targetId}`, adminToken, {
        role: 'LECTURER',
        reason: 'Test role change',
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ userId: targetId, roles: ['LECTURER', 'STUDENT'] });
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await request('DELETE', `/users/${targetId}/LECTURER`, adminToken, {
        reason: 'Test role change',
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ userId: targetId, roles: ['STUDENT'] });
    }
    expect((await request('GET', `/users/${targetId}`, adminToken)).status).toBe(200);
  });

  it('rejects unknown/extra input and absent targets without changing assignments', async () => {
    expect(
      (
        await request('POST', `/users/${targetId}`, adminToken, {
          role: 'LECTURER',
          reason: 'Test role change',
          actorId: adminId,
        })
      ).status,
    ).toBe(400);
    expect(
      (await request('POST', `/users/${targetId}`, adminToken, { role: 'MODERATOR' })).status,
    ).toBe(400);
    expect((await request('DELETE', `/users/${targetId}/MODERATOR`, adminToken)).status).toBe(400);
    expect((await request('GET', '/users/not-a-uuid', adminToken)).status).toBe(400);
    expect(
      (
        await request('POST', `/users/${missingId}`, adminToken, {
          role: 'STUDENT',
          reason: 'Test role change',
        })
      ).status,
    ).toBe(404);
    expect([...assignments.get(targetId)!]).toEqual([RoleName.Student]);
  });

  it('grants ADMIN to another user and forbids self-revocation', async () => {
    const granted = await request('POST', `/users/${targetId}`, adminToken, {
      role: 'ADMIN',
      reason: 'Promotion',
    });
    expect(granted.status).toBe(200);
    expect(assignments.get(targetId)?.has(RoleName.Admin)).toBe(true);
    const denied = await request('DELETE', `/users/${adminId}/ADMIN`, adminToken, {
      reason: 'Self removal',
    });
    expect(denied.status).toBe(403);
  });

  it('documents exactly the three approved operations with Bearer security', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().addBearerAuth().build(),
    );
    expect(Object.keys(document.paths).sort()).toEqual([
      '/api/roles/users/{userId}',
      '/api/roles/users/{userId}/{role}',
    ]);
    for (const operation of [
      document.paths['/api/roles/users/{userId}']?.get,
      document.paths['/api/roles/users/{userId}']?.post,
      document.paths['/api/roles/users/{userId}/{role}']?.delete,
    ]) {
      expect(operation?.security).toEqual([{ bearer: [] }]);
      expect(operation?.responses['409']).toBeDefined();
    }
  });
});
