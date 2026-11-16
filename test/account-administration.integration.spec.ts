import { randomUUID } from 'node:crypto';

import { issueCsrfToken } from '@app/common';
import { HttpModule } from '@nestjs/axios';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Workbook } from 'exceljs';
import type { NextFunction, Request, Response } from 'express';
import { DataSource } from 'typeorm';

import { GatewaySessionService } from '../apps/api-gateway/src/application/auth/gateway-session.service';
import { GatewayProxyService } from '../apps/api-gateway/src/application/proxy/gateway-proxy.service';
import { IdentitySessionClient } from '../apps/api-gateway/src/infrastructure/identity/identity-session.client';
import { GatewayProxyController } from '../apps/api-gateway/src/presentation/controllers/gateway-proxy.controller';
import { GatewayAuthMiddleware } from '../apps/api-gateway/src/presentation/middleware/gateway-auth.middleware';
import { seedRbac } from '../apps/identity-service/src/database/seed-rbac';

import { AuthTokenIssuer, BK_TOKEN_SERVICE, type BkTokenService } from '@/modules/auth/application';
import { AuthModule } from '@/modules/auth/auth.module';
import { Argon2PasswordHasher } from '@/modules/auth/infrastructure/security';
import { identityEntities } from '@/modules/identity.entities';
import { UsersModule } from '@/modules/users';

/**
 * Black-box API tests for the SRS v3 UC07 / UC-QT01 account administration (WEB10_*).
 * Requests go through the real Gateway auth middleware and proxy to the real Identity
 * app on an isolated PostgreSQL schema. Case ids are kept in the test titles so the
 * report can be filled from the Jest output.
 */
const testUrl = process.env.ACCOUNT_ADMIN_TEST_DATABASE_URL;
const databaseTests = testUrl ? describe : describe.skip;

type Json = Record<string, unknown>;
interface ApiResult {
  status: number;
  body: Json;
  text: string;
}

databaseTests('Account administration API — Gateway, Identity and PostgreSQL', () => {
  const schema = `account_admin_${randomUUID().replaceAll('-', '')}`;
  const config = {
    AUTH_FLOW_STORE: 'memory',
    ACCOUNT_IMPORT_PASSWORD: '123456',
    INTERNAL_SERVICE_SECRET: 'test-only-internal-service-secret-32',
    CORS_ORIGINS: 'http://localhost:3006',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'r'.repeat(32),
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '7d',
    MICROSOFT_TENANT_ID: randomUUID(),
    MICROSOFT_CLIENT_ID: randomUUID(),
    MICROSOFT_CLIENT_SECRET: 'test-only',
    MICROSOFT_REDIRECT_URI: 'http://localhost/callback',
    AUTH_WEB_LOGIN_REDIRECT_URL: 'http://localhost/login',
  };
  const hasher = new Argon2PasswordHasher();
  const password = 'Str0ng-pass!';
  const reason = 'Test reason';
  let identity: INestApplication;
  let gateway: INestApplication;
  let administration: DataSource;
  let database: DataSource;
  let identityUrl: string;
  let gatewayUrl: string;
  let access: string;
  let adminId: string;
  let adminSid: string;
  let passwordHash: string;
  let tokens: BkTokenService;
  let counter = 0;

  beforeAll(async () => {
    if (!testUrl || !new URL(testUrl).pathname.endsWith('_test'))
      throw new Error('Use an isolated _test database');
    administration = new DataSource({ type: 'postgres', url: testUrl, synchronize: false });
    await administration.initialize();
    await administration.query('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public');
    await administration.query(`CREATE SCHEMA "${schema}"`);
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => config] }),
        JwtModule.register({ global: true }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: testUrl,
          schema,
          entities: identityEntities,
          extra: { options: `-c search_path=${schema},public` },
          migrations: ['apps/identity-service/src/database/migrations/*.ts'],
          migrationsRun: true,
          synchronize: false,
        }),
        AuthModule,
        UsersModule,
      ],
    }).compile();
    identity = module.createNestApplication({ logger: false });
    identity.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await identity.listen(0, '127.0.0.1');
    identityUrl = await identity.getUrl();
    database = identity.get(DataSource);
    tokens = identity.get<BkTokenService>(BK_TOKEN_SERVICE);
    const gatewayConfig = new ConfigService({
      ...config,
      IDENTITY_SERVICE_URL: identityUrl,
      LEARNING_SERVICE_URL: identityUrl,
      SUBMISSION_SERVICE_URL: identityUrl,
      COMMUNITY_SERVICE_URL: identityUrl,
    });
    const gatewayModule = await Test.createTestingModule({
      imports: [HttpModule, JwtModule.register({ global: true })],
      controllers: [GatewayProxyController],
      providers: [
        GatewayProxyService,
        GatewayAuthMiddleware,
        GatewaySessionService,
        IdentitySessionClient,
        { provide: ConfigService, useValue: gatewayConfig },
      ],
    }).compile();
    gateway = gatewayModule.createNestApplication({ logger: false });
    const auth = gateway.get(GatewayAuthMiddleware);
    gateway.use((request: Request, response: Response, next: NextFunction) => {
      void auth.use(request, response, next).catch(next);
    });
    await gateway.listen(0, '127.0.0.1');
    gatewayUrl = await gateway.getUrl();
    passwordHash = await hasher.hash('test-password');
  }, 30000);

  beforeEach(async () => {
    await database.query(`TRUNCATE "${schema}".users CASCADE`);
    await database.transaction(seedRbac);
    adminId = randomUUID();
    await database.query('INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)', [
      adminId,
      'admin@test.invalid',
      passwordHash,
    ]);
    await database.query("INSERT INTO user_roles SELECT $1, id FROM roles WHERE name = 'ADMIN'", [
      adminId,
    ]);
    access = await tokenFor(adminId, 'admin@test.invalid', ['ADMIN']);
    adminSid = (await tokens.verifyAccessClaims(access)).sid;
  });

  afterAll(async () => {
    if (gateway) await gateway.close();
    if (identity) await identity.close();
    if (administration?.isInitialized) {
      await administration.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await administration.destroy();
    }
  });

  async function tokenFor(userId: string, email: string, roles: string[]): Promise<string> {
    return (
      await identity.get(AuthTokenIssuer).issueNewFamily({
        userId,
        studentId: null,
        email,
        status: 'ACTIVE',
        roles,
      })
    ).accessToken;
  }

  function parseJson(text: string): Json {
    try {
      return text ? (JSON.parse(text) as Json) : {};
    } catch {
      return {};
    }
  }

  async function call(
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = { authorization: `Bearer ${access}` },
  ): Promise<ApiResult> {
    const response = await fetch(`${gatewayUrl}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, body: parseJson(text), text };
  }

  async function createUser(overrides: Json = {}, token = access): Promise<ApiResult> {
    counter += 1;
    const role = (overrides.role as string | undefined) ?? 'STUDENT';
    const defaults: Json =
      role === 'STUDENT'
        ? {
            studentId: `2100${String(counter).padStart(3, '0')}`,
            email: `student${counter}@sv1.dut.udn.vn`,
          }
        : { studentId: null, email: `${role.toLowerCase()}${counter}@dut.udn.vn` };
    return call(
      'POST',
      '/api/admin/users',
      { displayName: `User ${counter}`, password, role, reason, ...defaults, ...overrides },
      { authorization: `Bearer ${token}` },
    );
  }

  async function login(identifier: string, secret = password): Promise<globalThis.Response> {
    return fetch(`${identityUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-client-type': 'mobile' },
      body: JSON.stringify({ identifier, password: secret }),
    });
  }

  async function loginToken(
    identifier: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const response = await login(identifier);
    expect(response.status).toBe(200);
    return (await response.json()) as { accessToken: string; refreshToken: string };
  }

  async function count(sql: string, params: unknown[] = []): Promise<number> {
    const rows = await database.query<{ count: string }[]>(sql, params);
    return Number(rows[0]?.count);
  }

  const users = (): Promise<number> => count('SELECT count(*) FROM users');
  const audits = (): Promise<number> => count('SELECT count(*) FROM admin_audit_events');
  const idOf = (result: ApiResult): string => result.body.userId as string;

  async function insertUser(status: string, email: string): Promise<string> {
    const id = randomUUID();
    await database.query(
      'INSERT INTO users (id, email, password_hash, status) VALUES ($1, $2, $3, $4)',
      [id, email, await hasher.hash(password), status],
    );
    return id;
  }

  async function workbook(rows: unknown[][], header: boolean = true): Promise<Buffer> {
    const book = new Workbook();
    const sheet = book.addWorksheet('Accounts');
    if (header) sheet.addRow(['mssv', 'name', 'email', 'role']);
    rows.forEach((row) => sheet.addRow(row));
    return Buffer.from(await book.xlsx.writeBuffer());
  }

  async function upload(content: Buffer | null, filename = 'accounts.xlsx'): Promise<ApiResult> {
    const body = new FormData();
    if (content) body.set('file', new Blob([Uint8Array.from(content).buffer]), filename);
    const response = await fetch(`${gatewayUrl}/api/auth/accounts/import`, {
      method: 'POST',
      headers: { authorization: `Bearer ${access}` },
      body,
    });
    const text = await response.text();
    return { status: response.status, body: text ? (JSON.parse(text) as Json) : {}, text };
  }

  const importRow = (
    n: number,
    extra: Partial<Record<'name' | 'role', string>> = {},
  ): unknown[] => [
    `2200${String(n).padStart(4, '0')}`,
    extra.name ?? `Import ${n}`,
    `import${n}@sv1.dut.udn.vn`,
    extra.role ?? 'STUDENT',
  ];

  it('WEB10_009 / WEB10_010 / WEB10_011 paginates, returns empty pages and enforces the limit range', async () => {
    for (let i = 0; i < 4; i += 1) expect((await createUser()).status).toBe(201);
    const full = await call('GET', '/api/admin/users?limit=50');
    const all = full.body.items as { userId: string }[];
    expect(full.status).toBe(200);
    expect(all).toHaveLength(await count('SELECT count(*) FROM users WHERE deleted_at IS NULL'));
    expect(all.length).toBeGreaterThanOrEqual(5);

    const paged: string[] = [];
    let hasMore = true;
    for (let page = 1; hasMore; page += 1) {
      const result = await call('GET', `/api/admin/users?page=${page}&limit=2`);
      expect(result.status).toBe(200);
      expect(result.body).toMatchObject({ page, limit: 2 });
      expect((result.body.items as unknown[]).length).toBeLessThanOrEqual(2);
      paged.push(...(result.body.items as { userId: string }[]).map((item) => item.userId));
      hasMore = result.body.hasMore as boolean;
      expect(page).toBeLessThan(10);
    }
    expect(paged).toEqual(all.map((item) => item.userId));
    expect(new Set(paged).size).toBe(paged.length);

    const none = await call('GET', '/api/admin/users?q=zzz-no-match&page=2&limit=5');
    expect(none.status).toBe(200);
    expect(none.body).toEqual({ items: [], page: 2, limit: 5, hasMore: false });
    const first = await call('GET', '/api/admin/users?q=zzz-no-match');
    expect(first.body).toEqual({ items: [], page: 1, limit: 20, hasMore: false });

    const one = await call('GET', '/api/admin/users?limit=1');
    expect(one.status).toBe(200);
    expect(one.body.items as unknown[]).toHaveLength(1);
    expect((await call('GET', '/api/admin/users?limit=50')).status).toBe(200);
    for (const query of ['limit=51', 'limit=0', 'page=0', 'limit=abc', 'page=-1'])
      expect((await call('GET', `/api/admin/users?${query}`)).status).toBe(400);
  });

  it('WEB10_077 / WEB10_078 creates STUDENT, LECTURER and ADMIN accounts, validates the password and stores only an Argon2 hash', async () => {
    const lecturer = await createUser({ role: 'LECTURER', displayName: 'Giang Vien' });
    expect(lecturer.status).toBe(201);
    expect(lecturer.body).toMatchObject({
      studentId: null,
      displayName: 'Giang Vien',
      status: 'ACTIVE',
      roles: ['LECTURER'],
    });
    const admin = await createUser({ role: 'ADMIN' });
    expect(admin.status).toBe(201);
    expect(admin.body).toMatchObject({ studentId: null, roles: ['ADMIN'], status: 'ACTIVE' });
    const student = await createUser();
    expect(student.status).toBe(201);
    expect(student.body).toMatchObject({ roles: ['STUDENT'], status: 'ACTIVE' });
    for (const result of [lecturer, admin, student]) {
      expect(result.text).not.toMatch(/password|argon2/i);
      expect(await count('SELECT count(*) FROM profiles WHERE user_id = $1', [idOf(result)])).toBe(
        1,
      );
    }

    expect((await createUser({ role: 'LECTURER', studentId: '2100999' })).status).toBe(400);
    expect((await createUser({ role: 'ADMIN', studentId: '2100998' })).status).toBe(400);
    expect((await createUser({ studentId: null })).status).toBe(400);
    expect((await createUser({ email: 'wrong@dut.udn.vn' })).status).toBe(400);
    expect((await createUser({ role: 'LECTURER', email: 'wrong@sv1.dut.udn.vn' })).status).toBe(
      400,
    );

    const before = await users();
    expect((await createUser({ password: 'a'.repeat(7) })).status).toBe(400);
    expect((await createUser({ password: 'a'.repeat(129) })).status).toBe(400);
    expect(await users()).toBe(before);
    const min = await createUser({ password: 'a'.repeat(8) });
    const max = await createUser({ password: 'b'.repeat(128) });
    expect([min.status, max.status]).toEqual([201, 201]);

    const [row] = await database.query<{ password_hash: string }[]>(
      'SELECT password_hash FROM users WHERE id = $1',
      [idOf(student)],
    );
    expect(row?.password_hash).toMatch(/^\$argon2/);
    expect(row?.password_hash).not.toContain(password);
    expect(await hasher.verify(row!.password_hash, password)).toBe(true);
  });

  it('WEB10_079 rolls back a duplicate email or MSSV without leaving a partial row or audit entry', async () => {
    const first = await createUser({ studentId: '2100777', email: 'dup@sv1.dut.udn.vn' });
    expect(first.status).toBe(201);
    const snapshot = {
      users: await users(),
      audits: await audits(),
      profiles: await count('SELECT count(*) FROM profiles'),
      roles: await count('SELECT count(*) FROM user_roles'),
    };
    const sameEmail = await createUser({ studentId: '2100778', email: 'DUP@sv1.dut.udn.vn' });
    const sameStudentId = await createUser({ studentId: '2100777', email: 'other@sv1.dut.udn.vn' });
    expect([sameEmail.status, sameStudentId.status]).toEqual([409, 409]);
    expect({
      users: await users(),
      audits: await audits(),
      profiles: await count('SELECT count(*) FROM profiles'),
      roles: await count('SELECT count(*) FROM user_roles'),
    }).toEqual(snapshot);
  });

  it('WEB10_085 writes one durable audit entry per create, status change, delete and role change without secrets', async () => {
    const created = await createUser({ reason: 'Create reason' });
    const id = idOf(created);
    expect(
      (
        await call('PATCH', `/api/admin/users/${id}/status`, {
          status: 'LOCKED',
          reason: 'Lock reason',
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call('PATCH', `/api/admin/users/${id}/status`, {
          status: 'ACTIVE',
          reason: 'Unlock reason',
        })
      ).status,
    ).toBe(200);
    expect(
      (await call('POST', `/api/roles/users/${id}`, { role: 'LECTURER', reason: 'Grant reason' }))
        .status,
    ).toBe(200);
    expect(
      (await call('DELETE', `/api/roles/users/${id}/LECTURER`, { reason: 'Revoke reason' })).status,
    ).toBe(200);
    expect(
      (await call('DELETE', `/api/admin/users/${id}`, { reason: 'Delete reason' })).status,
    ).toBe(204);
    const rows = await database.query<
      {
        actor_id: string;
        action: string;
        reason: string;
        before_state: unknown;
        after_state: unknown;
      }[]
    >(
      'SELECT actor_id, action, reason, before_state, after_state FROM admin_audit_events WHERE target_id = $1 ORDER BY occurred_at, id',
      [id],
    );
    expect(rows.map((row) => row.reason)).toEqual([
      'Create reason',
      'Lock reason',
      'Unlock reason',
      'Grant reason',
      'Revoke reason',
      'Delete reason',
    ]);
    expect(new Set(rows.map((row) => row.actor_id))).toEqual(new Set([adminId]));
    expect(new Set(rows.map((row) => row.action)).size).toBe(6);
    expect(JSON.stringify(rows)).not.toMatch(/password|argon2|token/i);
    expect(rows[1]!.before_state).not.toEqual(rows[1]!.after_state);

    const failed = await audits();
    expect(
      (await call('PATCH', `/api/admin/users/${randomUUID()}/status`, { status: 'LOCKED', reason }))
        .status,
    ).toBe(404);
    expect(await audits()).toBe(failed);
  });

  it('WEB10_088 rejects every administrative mutation without a reason and changes nothing', async () => {
    const student = idOf(await createUser());
    const target = await createUser({ role: 'LECTURER' });
    const id = idOf(target);
    const before = {
      users: await database.query<unknown[]>(
        'SELECT id, status, deleted_at FROM users ORDER BY id',
      ),
      audits: await audits(),
    };
    const rolesBefore = await database.query<unknown[]>(
      'SELECT user_id, role_id FROM user_roles ORDER BY 1, 2',
    );
    for (const bad of [undefined, '', '   ']) {
      const body = bad === undefined ? {} : { reason: bad };
      const results = [
        await createUser({ reason: bad, email: 'noreason@sv1.dut.udn.vn', studentId: '2100555' }),
        await call('PATCH', `/api/admin/users/${student}/status`, { status: 'LOCKED', ...body }),
        await call('DELETE', `/api/admin/users/${student}`, body),
        await call('POST', `/api/roles/users/${id}`, { role: 'STUDENT', ...body }),
        await call('DELETE', `/api/roles/users/${id}/LECTURER`, body),
      ];
      expect(results.map((result) => result.status)).toEqual([400, 400, 400, 400, 400]);
    }
    expect(await database.query('SELECT id, status, deleted_at FROM users ORDER BY id')).toEqual(
      before.users,
    );
    expect(await database.query('SELECT user_id, role_id FROM user_roles ORDER BY 1, 2')).toEqual(
      rolesBefore,
    );
    expect(await audits()).toBe(before.audits);
  });

  it('WEB10_080 searches by MSSV, email and name case-insensitively and combines role/status filters', async () => {
    const an = await createUser({
      studentId: '2100111',
      email: 'nguyen.an@sv1.dut.udn.vn',
      displayName: 'Nguyen Van An',
    });
    const binh = await createUser({
      studentId: '2100222',
      email: 'tran.binh@sv1.dut.udn.vn',
      displayName: 'Tran Binh',
    });
    const giang = await createUser({
      role: 'LECTURER',
      email: 'le.giang@dut.udn.vn',
      displayName: 'Le Giang',
    });
    expect(
      (await call('PATCH', `/api/admin/users/${idOf(binh)}/status`, { status: 'LOCKED', reason }))
        .status,
    ).toBe(200);
    const search = async (query: string): Promise<string[]> => {
      const result = await call('GET', `/api/admin/users?${query}`);
      expect(result.status).toBe(200);
      return (result.body.items as { userId: string }[]).map((item) => item.userId);
    };
    expect(await search('q=2100111')).toEqual([idOf(an)]);
    expect(await search('q=NGUYEN.AN@SV1')).toEqual([idOf(an)]);
    expect(await search('q=nguyen%20van')).toEqual([idOf(an)]);
    expect(await search('q=NGUYEN%20VAN')).toEqual([idOf(an)]);
    expect(await search('q=le.giang')).toEqual([idOf(giang)]);
    expect(await search('role=LECTURER&q=le')).toEqual([idOf(giang)]);
    expect(await search('status=LOCKED')).toEqual([idOf(binh)]);
    expect(await search('q=tran&role=STUDENT&status=LOCKED')).toEqual([idOf(binh)]);
    expect(await search('q=tran&role=LECTURER')).toEqual([]);
    expect(await search('q=tran&status=ACTIVE')).toEqual([]);
    expect((await call('GET', '/api/admin/users?role=HACKER')).status).toBe(400);
    expect((await call('GET', '/api/admin/users?status=DELETED')).status).toBe(400);
  });

  it('WEB10_082 / WEB10_083 locking revokes sessions and blocks login/refresh; PENDING cannot be unlocked by the status API', async () => {
    const student = await createUser();
    const id = idOf(student);
    const email = student.body.email as string;
    const pair = await loginToken(email);
    const locked = await call('PATCH', `/api/admin/users/${id}/status`, {
      status: 'LOCKED',
      reason,
    });
    expect(locked.status).toBe(200);
    expect(locked.body).toMatchObject({ status: 'LOCKED' });
    expect((await login(email)).status).toBe(401);
    const refresh = await fetch(`${identityUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-client-type': 'mobile' },
      body: JSON.stringify({ refreshToken: pair.refreshToken }),
    });
    expect(refresh.status).toBe(401);
    expect(
      await count('SELECT count(*) FROM sessions WHERE user_id = $1 AND revoked_at IS NULL', [id]),
    ).toBe(0);
    const unlocked = await call('PATCH', `/api/admin/users/${id}/status`, {
      status: 'ACTIVE',
      reason,
    });
    expect(unlocked.status).toBe(200);
    expect((await login(email)).status).toBe(200);

    const pending = await insertUser('PENDING', 'pending@sv1.dut.udn.vn');
    const auditsBefore = await audits();
    expect(
      (await call('PATCH', `/api/admin/users/${pending}/status`, { status: 'ACTIVE', reason }))
        .status,
    ).toBe(409);
    expect(
      (
        await database.query<{ status: string }[]>('SELECT status FROM users WHERE id = $1', [
          pending,
        ])
      )[0]?.status,
    ).toBe('PENDING');
    expect(await audits()).toBe(auditsBefore);
  });

  it('WEB10_040 / WEB10_084 protects self, system accounts and the last ACTIVE Admin; other Admins can be managed', async () => {
    const auditsBefore = await audits();
    expect(
      (await call('PATCH', `/api/admin/users/${adminId}/status`, { status: 'LOCKED', reason }))
        .status,
    ).toBe(403);
    expect((await call('DELETE', `/api/admin/users/${adminId}`, { reason })).status).toBe(403);
    const system = randomUUID();
    await database.query(
      'INSERT INTO users (id, email, password_hash, is_system_account) VALUES ($1, $2, $3, true)',
      [system, 'system@test.invalid', passwordHash],
    );
    expect(
      (await call('PATCH', `/api/admin/users/${system}/status`, { status: 'LOCKED', reason }))
        .status,
    ).toBe(403);
    expect((await call('DELETE', `/api/admin/users/${system}`, { reason })).status).toBe(403);
    expect(await audits()).toBe(auditsBefore);
    expect(
      await count("SELECT count(*) FROM users WHERE status <> 'ACTIVE' OR deleted_at IS NOT NULL"),
    ).toBe(0);

    const other = await createUser({ role: 'ADMIN' });
    const otherId = idOf(other);
    expect(
      (await call('PATCH', `/api/admin/users/${otherId}/status`, { status: 'LOCKED', reason }))
        .status,
    ).toBe(200);
    expect(
      (await call('PATCH', `/api/admin/users/${otherId}/status`, { status: 'ACTIVE', reason }))
        .status,
    ).toBe(200);
    expect((await call('DELETE', `/api/admin/users/${otherId}`, { reason })).status).toBe(204);

    // Last ACTIVE Admin: the actor session is still valid but no longer counts as an ACTIVE Admin.
    const target = idOf(await createUser({ role: 'ADMIN' }));
    await database.query("UPDATE users SET status = 'LOCKED' WHERE id = $1", [adminId]);
    const lastLock = await call('PATCH', `/api/admin/users/${target}/status`, {
      status: 'LOCKED',
      reason,
    });
    const lastDelete = await call('DELETE', `/api/admin/users/${target}`, { reason });
    expect([lastLock.status, lastDelete.status]).toEqual([409, 409]);
    expect(
      (
        await database.query<{ status: string; deleted_at: unknown }[]>(
          'SELECT status, deleted_at FROM users WHERE id = $1',
          [target],
        )
      )[0],
    ).toEqual({ status: 'ACTIVE', deleted_at: null });
  });

  it('WEB10_037 / WEB10_039 / WEB10_046 soft-deletes a Lecturer keeping identity, roles, profile and audit; handles unknown or malformed ids', async () => {
    const lecturer = await createUser({ role: 'LECTURER' });
    const id = idOf(lecturer);
    const email = lecturer.body.email as string;
    await loginToken(email);
    const keep = {
      users: await users(),
      profiles: await count('SELECT count(*) FROM profiles WHERE user_id = $1', [id]),
      roles: await count('SELECT count(*) FROM user_roles WHERE user_id = $1', [id]),
    };
    expect((await call('DELETE', `/api/admin/users/${id}`, { reason })).status).toBe(204);
    expect((await call('DELETE', `/api/admin/users/${id}`, { reason })).status).toBe(204);
    const [row] = await database.query<
      { status: string; deleted_at: Date | null; email: string }[]
    >('SELECT status, deleted_at, email FROM users WHERE id = $1', [id]);
    expect(row?.deleted_at).not.toBeNull();
    expect(row?.status).toBe('ACTIVE');
    expect(row?.email).toBe(email);
    expect({
      users: await users(),
      profiles: await count('SELECT count(*) FROM profiles WHERE user_id = $1', [id]),
      roles: await count('SELECT count(*) FROM user_roles WHERE user_id = $1', [id]),
    }).toEqual(keep);
    expect(
      await count(
        "SELECT count(*) FROM admin_audit_events WHERE target_id = $1 AND action <> 'CREATE'",
        [id],
      ),
    ).toBeGreaterThanOrEqual(1);
    expect(
      await count('SELECT count(*) FROM sessions WHERE user_id = $1 AND revoked_at IS NULL', [id]),
    ).toBe(0);
    expect((await login(email)).status).toBe(401);
    const hidden = (await call('GET', '/api/admin/users?limit=50')).body.items as {
      userId: string;
    }[];
    expect(hidden.map((item) => item.userId)).not.toContain(id);
    const shown = (await call('GET', '/api/admin/users?limit=50&includeDeleted=true')).body
      .items as { userId: string; deletedAt: unknown }[];
    expect(shown.find((item) => item.userId === id)?.deletedAt).not.toBeNull();
    expect((await call('GET', `/api/admin/users/${id}`)).body).toMatchObject({
      userId: id,
      roles: ['LECTURER'],
    });

    const deletedBefore = await count('SELECT count(*) FROM users WHERE deleted_at IS NOT NULL');
    expect((await call('DELETE', `/api/admin/users/${randomUUID()}`, { reason })).status).toBe(404);
    expect((await call('DELETE', '/api/admin/users/not-a-uuid', { reason })).status).toBe(400);
    expect(await count('SELECT count(*) FROM users WHERE deleted_at IS NOT NULL')).toBe(
      deletedBefore,
    );
  });

  it('WEB10_049 grants STUDENT to a Lecturer without creating a user or MSSV', async () => {
    const lecturer = await createUser({ role: 'LECTURER' });
    const id = idOf(lecturer);
    const before = await users();
    const granted = await call('POST', `/api/roles/users/${id}`, { role: 'STUDENT', reason });
    expect(granted.status).toBe(200);
    expect((granted.body.roles as string[]).slice().sort()).toEqual(['LECTURER', 'STUDENT']);
    expect(await users()).toBe(before);
    expect(
      (
        await database.query<{ student_id: string | null }[]>(
          'SELECT student_id FROM users WHERE id = $1',
          [id],
        )
      )[0]?.student_id,
    ).toBeNull();
  });

  it('WEB10_059 revoking ADMIN removes the permissions from new tokens while an old token keeps its snapshot', async () => {
    const student = await createUser();
    const id = idOf(student);
    const email = student.body.email as string;
    expect((await call('POST', `/api/roles/users/${id}`, { role: 'ADMIN', reason })).status).toBe(
      200,
    );
    const oldPair = await loginToken(email);
    const oldClaims = await tokens.verifyAccessClaims(oldPair.accessToken);
    expect(oldClaims.roles).toEqual(expect.arrayContaining(['ADMIN', 'STUDENT']));
    expect(oldClaims.permissions).toEqual(
      expect.arrayContaining(['user:read', 'user:create', 'user:status']),
    );
    expect(
      (
        await call('GET', '/api/admin/users', undefined, {
          authorization: `Bearer ${oldPair.accessToken}`,
        })
      ).status,
    ).toBe(200);

    expect((await call('DELETE', `/api/roles/users/${id}/ADMIN`, { reason })).status).toBe(200);
    const newPair = await loginToken(email);
    const newClaims = await tokens.verifyAccessClaims(newPair.accessToken);
    expect(newClaims.roles).toEqual(['STUDENT']);
    expect(newClaims.permissions).toEqual([]);
    expect(
      (
        await call('GET', '/api/admin/users', undefined, {
          authorization: `Bearer ${newPair.accessToken}`,
        })
      ).status,
    ).toBe(403);
    expect((await tokens.verifyAccessClaims(oldPair.accessToken)).roles).toContain('ADMIN');
  });

  it('WEB10_061 changing roles does not unlock LOCKED or PENDING accounts', async () => {
    const locked = await createUser({ role: 'LECTURER' });
    const lockedId = idOf(locked);
    expect(
      (await call('PATCH', `/api/admin/users/${lockedId}/status`, { status: 'LOCKED', reason }))
        .status,
    ).toBe(200);
    expect(
      (await call('POST', `/api/roles/users/${lockedId}`, { role: 'STUDENT', reason })).status,
    ).toBe(200);
    const pendingId = await insertUser('PENDING', 'pending2@sv1.dut.udn.vn');
    await database.query("INSERT INTO user_roles SELECT $1, id FROM roles WHERE name = 'STUDENT'", [
      pendingId,
    ]);
    expect(
      (await call('POST', `/api/roles/users/${pendingId}`, { role: 'LECTURER', reason })).status,
    ).toBe(200);
    const states = await database.query<{ id: string; status: string }[]>(
      'SELECT id, status FROM users WHERE id = ANY($1::uuid[]) ORDER BY status',
      [[lockedId, pendingId]],
    );
    expect(states.map((state) => state.status)).toEqual(['LOCKED', 'PENDING']);
    expect((await login(locked.body.email as string)).status).toBe(401);
    expect((await login('pending2@sv1.dut.udn.vn')).status).toBe(401);
  });

  it('WEB10_065 rejects a web cookie request from an untrusted Origin without changing data', async () => {
    const csrf = issueCsrfToken(adminSid, config.JWT_ACCESS_SECRET);
    const body = {
      studentId: '2100901',
      displayName: 'Origin Test',
      email: 'origin@sv1.dut.udn.vn',
      password,
      role: 'STUDENT',
      reason,
    };
    const before = { users: await users(), audits: await audits() };
    const forged = await call('POST', '/api/admin/users', body, {
      cookie: `__Host-bk_access=${access}; __Host-bk_csrf=${csrf}`,
      origin: 'http://evil.example',
      'x-csrf-token': csrf,
    });
    expect(forged.status).toBe(403);
    expect(forged.text).toContain('Untrusted request origin');
    expect({ users: await users(), audits: await audits() }).toEqual(before);
    const trusted = await call('POST', '/api/admin/users', body, {
      cookie: `__Host-bk_access=${access}; __Host-bk_csrf=${csrf}`,
      origin: config.CORS_ORIGINS,
      'x-csrf-token': csrf,
    });
    expect(trusted.status).toBe(201);
  });

  it('WEB10_022 / WEB10_023 / WEB10_068 reject a missing file, a fake .xlsx and a header-only workbook', async () => {
    const before = await users();
    const missing = await upload(null);
    expect(missing.status).toBe(400);
    expect(missing.body).toMatchObject({ code: 'invalid_file', created: 0 });
    const fake = await upload(Buffer.from('this is not a workbook'));
    expect(fake.status).toBe(400);
    expect(fake.body).toMatchObject({ code: 'invalid_file', created: 0 });
    const empty = await upload(await workbook([]));
    expect(empty.status).toBe(400);
    expect(empty.body).toMatchObject({ code: 'invalid_file', created: 0 });
    expect(JSON.stringify(empty.body)).toContain('empty_file');
    expect(await users()).toBe(before);
  });

  it('WEB10_030 / WEB10_070 / WEB10_071 / WEB10_072 report row-level validation issues without leaking cell values or writing', async () => {
    const before = await users();
    const run = async (rows: unknown[][]): Promise<ApiResult> => upload(await workbook(rows));
    const bad = await run([
      ['2300001', 'Bad Email', 'not-an-email', 'STUDENT'],
      ['2300002', '   ', 'blank.name@sv1.dut.udn.vn', 'STUDENT'],
    ]);
    expect(bad.status).toBe(400);
    expect(bad.body).toMatchObject({ code: 'invalid_rows', created: 0 });
    expect(bad.body.issues).toEqual(
      expect.arrayContaining([
        { row: 2, field: 'email', code: 'invalid_email' },
        { row: 3, field: 'name', code: 'invalid_name' },
      ]),
    );
    expect(bad.text).not.toContain('blank.name@sv1.dut.udn.vn');

    const long = await run([importRow(1, { name: 'N'.repeat(101) })]);
    expect(long.body.issues).toContainEqual({ row: 2, field: 'name', code: 'invalid_name' });
    const tooLongId = await run([['9'.repeat(65), 'Long Id', 'longid@sv1.dut.udn.vn', 'STUDENT']]);
    expect(tooLongId.body.issues).toContainEqual({
      row: 2,
      field: 'mssv',
      code: 'invalid_student_id',
    });
    const spaced = await run([['2300 003', 'Spaced Id', 'spaced@sv1.dut.udn.vn', 'STUDENT']]);
    expect(spaced.body.issues).toContainEqual({
      row: 2,
      field: 'mssv',
      code: 'invalid_student_id',
    });
    for (const role of ['student', 'Lecturer', ' STUDENT'])
      expect((await run([importRow(3, { role })])).body.issues).toContainEqual({
        row: 2,
        field: 'role',
        code: 'invalid_role',
      });
    expect(await users()).toBe(before);

    const ok100 = await run([
      importRow(4, { name: 'N'.repeat(100) }),
      [' 2300005 ', 'Trimmed Id', 'trim@sv1.dut.udn.vn', 'STUDENT'],
    ]);
    expect(ok100.status).toBe(201);
    expect(ok100.body).toMatchObject({ totalRows: 2, created: 2 });
    expect(await count("SELECT count(*) FROM users WHERE student_id = '2300005'")).toBe(1);
  });

  it('WEB10_069 skips a completely blank row between valid rows', async () => {
    const before = await users();
    const result = await upload(await workbook([importRow(1), [], importRow(2)]));
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({ totalRows: 2, created: 2 });
    expect(await users()).toBe(before + 2);
  });

  it('WEB10_027 accepts 1000 data rows and rejects 1001 atomically', async () => {
    const before = await users();
    const rows = (total: number): unknown[][] =>
      Array.from({ length: total }, (_, index) => importRow(index + 1));
    const over = await upload(await workbook(rows(1001)));
    expect(over.status).toBe(400);
    expect(over.body).toMatchObject({ code: 'invalid_file', created: 0 });
    expect(JSON.stringify(over.body)).toContain('row_limit_exceeded');
    expect(await users()).toBe(before);
    const exact = await upload(await workbook(rows(1000)));
    expect(exact.status).toBe(201);
    expect(exact.body).toMatchObject({ totalRows: 1000, created: 1000 });
    expect(await users()).toBe(before + 1000);
  }, 240000);
});
