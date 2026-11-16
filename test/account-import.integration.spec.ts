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

import {
  AuthTokenIssuer,
  BK_TOKEN_SERVICE,
  REFRESH_SESSION_REPOSITORY,
  type BkTokenService,
  type RefreshSessionRepository,
} from '@/modules/auth/application';
import type { PreparedImportAccount } from '@/modules/auth/application/ports';
import { AuthModule } from '@/modules/auth/auth.module';
import { TypeormAccountImportRepository } from '@/modules/auth/infrastructure/persistence';
import { Argon2PasswordHasher } from '@/modules/auth/infrastructure/security';
import { identityEntities } from '@/modules/identity.entities';
import {
  TypeormProfileAccountContext,
  TypeormProfileRepository,
} from '@/modules/profiles/infrastructure/persistence';
import { RoleName } from '@/modules/rbac/domain';
import { User } from '@/modules/users/infrastructure/persistence';

const testUrl = process.env.ACCOUNT_IMPORT_TEST_DATABASE_URL;
const databaseTests = testUrl ? describe : describe.skip;

databaseTests('Account import — real Gateway, Auth and PostgreSQL', () => {
  const schema = `account_import_${randomUUID().replaceAll('-', '')}`;
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
  let identity: INestApplication;
  let gateway: INestApplication;
  let administration: DataSource;
  let database: DataSource;
  let identityUrl: string;
  let gatewayUrl: string;
  let access: string;
  let adminId: string;
  let passwordHash: string;
  let tokens: BkTokenService;

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
    access = (
      await identity.get(AuthTokenIssuer).issueNewFamily({
        userId: adminId,
        studentId: null,
        email: 'admin@test.invalid',
        status: 'ACTIVE',
        roles: ['ADMIN'],
      })
    ).accessToken;
  });

  afterAll(async () => {
    if (gateway) await gateway.close();
    if (identity) await identity.close();
    if (administration?.isInitialized) {
      await administration.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await administration.destroy();
    }
  });

  async function file(rows: unknown[][]): Promise<Buffer> {
    const book = new Workbook();
    const sheet = book.addWorksheet('Accounts');
    sheet.addRow(['mssv', 'name', 'email', 'role']);
    rows.forEach((row) => sheet.addRow(row));
    return Buffer.from(await book.xlsx.writeBuffer());
  }

  async function upload(
    content: Buffer,
    headers: Record<string, string> = { authorization: `Bearer ${access}` },
    url = gatewayUrl,
  ): Promise<globalThis.Response> {
    const body = new FormData();
    body.set('file', new Blob([Uint8Array.from(content).buffer]), 'accounts.xlsx');
    return fetch(`${url}/api/auth/accounts/import`, { method: 'POST', headers, body });
  }

  async function login(credentials: object): Promise<globalThis.Response> {
    return fetch(`${identityUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-client-type': 'mobile' },
      body: JSON.stringify(credentials),
    });
  }

  it('imports through cookie/CSRF Gateway multipart; supports both logins and official Profile names', async () => {
    const claims = await tokens.verifyAccessClaims(access);
    const csrf = issueCsrfToken(claims.sid, config.JWT_ACCESS_SECRET);
    const response = await upload(
      await file([
        ['001234', ' Nguyễn An ', ' STUDENT@sv1.dut.udn.vn ', 'STUDENT'],
        ['', 'Lecturer', 'lecturer@dut.udn.vn', 'LECTURER'],
      ]),
      {
        cookie: `__Host-bk_access=${access}; __Host-bk_csrf=${csrf}`,
        origin: config.CORS_ORIGINS,
        'x-csrf-token': csrf,
      },
    );
    const result: unknown = await response.json();
    expect({ status: response.status, body: result }).toEqual({
      status: 201,
      body: { totalRows: 2, created: 2 },
    });
    const users = await database
      .getRepository(User)
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .leftJoinAndSelect('user.roles', 'role')
      .where('user.id <> :id', { id: adminId })
      .orderBy('user.email')
      .getMany();
    expect(users).toHaveLength(2);
    expect(
      await database.query(
        'SELECT actor_id, action, reason FROM admin_audit_events WHERE target_id = ANY($1::uuid[]) ORDER BY target_id',
        [users.map((user) => user.id)],
      ),
    ).toEqual([
      { actor_id: adminId, action: 'IMPORT', reason: 'Excel account import' },
      { actor_id: adminId, action: 'IMPORT', reason: 'Excel account import' },
    ]);
    expect(users[0]).toMatchObject({ studentId: null, displayName: 'Lecturer', status: 'ACTIVE' });
    expect(users[0]?.passwordHash).not.toBe(users[1]?.passwordHash);
    for (const user of users) expect(await hasher.verify(user.passwordHash, '123456')).toBe(true);
    expect((await login({ identifier: '001234', password: '123456' })).status).toBe(200);
    const lecturerLogin = await login({ identifier: 'LECTURER@dut.udn.vn', password: '123456' });
    expect(lecturerLogin.status).toBe(200);
    const pair = (await lecturerLogin.json()) as { accessToken: string };
    expect((await tokens.verifyAccessClaims(pair.accessToken)).permissions).toContain(
      'problem:create',
    );
    expect((await tokens.verifyAccessClaims(access)).permissions).toContain('problem:create');
    expect((await login({ identifier: 'student@sv1.dut.udn.vn', password: '123456' })).status).toBe(
      200,
    );
    expect(
      (await login({ studentId: '001234', email: 'lecturer@dut.udn.vn', password: '123456' }))
        .status,
    ).toBe(400);
    const student = users.find((user) => user.studentId === '001234')!;
    const context = await new TypeormProfileAccountContext(database).findAccount(student.id);
    expect(context?.displayName).toBe('Nguyễn An');
    const profiles = new TypeormProfileRepository(database);
    await profiles.loadOrCreate(student.id, context!.displayName);
    await profiles.update(
      student.id,
      context!.displayName,
      { displayName: 'My chosen name' },
      false,
    );
    expect((await profiles.loadOrCreate(student.id, 'New official name')).displayName).toBe(
      'My chosen name',
    );
    await database.query("UPDATE users SET status = 'LOCKED' WHERE id = $1", [users[0]!.id]);
    expect((await login({ identifier: 'lecturer@dut.udn.vn', password: '123456' })).status).toBe(
      401,
    );
  });

  it('rejects the whole file for invalid/existing rows and preserves prior data', async () => {
    const content = await file([['42', 'Name', 'one@sv1.dut.udn.vn', 'STUDENT']]);
    expect((await upload(content)).status).toBe(201);
    const before = await database.query<unknown[]>(
      'SELECT id, password_hash, display_name FROM users ORDER BY id',
    );
    const duplicate = await upload(
      await file([
        ['43', 'New', 'new@sv1.dut.udn.vn', 'STUDENT'],
        ['42', 'Changed', 'ONE@sv1.dut.udn.vn', 'STUDENT'],
      ]),
    );
    expect(duplicate.status).toBe(409);
    const conflicts = (await duplicate.json()) as { created: number; issues: unknown[] };
    expect(conflicts.created).toBe(0);
    expect(conflicts.issues).toContainEqual({ row: 3, field: 'email', code: 'already_exists' });
    expect(
      await database.query('SELECT id, password_hash, display_name FROM users ORDER BY id'),
    ).toEqual(before);
    const invalid = await upload(
      await file([
        ['44', 'Name', 'new@sv1.dut.udn.vn', 'STUDENT'],
        ['', 'Name', 'bad@sv1.dut.udn.vn', 'ADMIN'],
      ]),
    );
    expect(invalid.status).toBe(400);
    const report: unknown = await invalid.json();
    expect(JSON.stringify(report)).not.toContain('@sv1.dut.udn.vn');
    expect(
      await database.query('SELECT id, password_hash, display_name FROM users ORDER BY id'),
    ).toEqual(before);
  });

  it('checks auth, session, ADMIN and user:import before parsing invalid bytes', async () => {
    const bad = Buffer.from('invalid workbook');
    expect((await upload(bad, {})).status).toBe(401);
    expect(
      (await upload(bad, { 'x-auth-roles': 'ADMIN', 'x-auth-permissions': 'user:import' })).status,
    ).toBe(401);
    const claims = await tokens.verifyAccessClaims(access);
    for (const [roles, permissions] of [
      [['ADMIN'], []],
      [['STUDENT'], ['user:import']],
    ] as const) {
      const token = await tokens.signAccess(
        {
          userId: adminId,
          studentId: null,
          email: 'admin@test.invalid',
          status: 'ACTIVE',
          roles: [...roles],
        },
        [...permissions],
        claims.sid,
      );
      expect((await upload(bad, { authorization: `Bearer ${token}` })).status).toBe(403);
    }
    const csrfDenied = await upload(bad, {
      cookie: `__Host-bk_access=${access}`,
      origin: config.CORS_ORIGINS,
    });
    expect(csrfDenied.status).toBe(403);
    await identity
      .get<RefreshSessionRepository>(REFRESH_SESSION_REPOSITORY)
      .revokeBySid(adminId, claims.sid);
    expect((await upload(bad, { authorization: `Bearer ${access}` }, identityUrl)).status).toBe(
      401,
    );
  });

  it('fails without writing when a required role has not been seeded', async () => {
    await database.query("DELETE FROM roles WHERE name = 'LECTURER'");
    const response = await upload(
      await file([
        ['50', 'Student', 's@sv1.dut.udn.vn', 'STUDENT'],
        ['', 'Lecturer', 'l@dut.udn.vn', 'LECTURER'],
      ]),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      issues: [{ row: 0, field: 'role', code: 'role_not_seeded' }],
    });
    expect(await database.getRepository(User).count()).toBe(1);
  });

  it('rejects an oversized upload through Gateway without writing accounts', async () => {
    const response = await upload(Buffer.alloc(5 * 1024 * 1024 + 1));
    expect(response.status).toBe(413);
    expect(await database.getRepository(User).count()).toBe(1);
  });

  it('serializes concurrent uniqueness conflicts without leaving a partial import', async () => {
    const repository = new TypeormAccountImportRepository(database);
    const shared: PreparedImportAccount = {
      row: 2,
      studentId: 'shared',
      displayName: 'Shared',
      email: 'shared@sv1.dut.udn.vn',
      role: RoleName.Student,
      passwordHash,
    };
    const results = await Promise.allSettled([
      repository.createAll(
        [shared, { ...shared, row: 3, studentId: 'first', email: 'first@sv1.dut.udn.vn' }],
        adminId,
      ),
      repository.createAll(
        [shared, { ...shared, row: 3, studentId: 'second', email: 'second@sv1.dut.udn.vn' }],
        adminId,
      ),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { code: 'conflict' },
    });
    expect(await database.getRepository(User).count()).toBe(3);
  });

  it('rolls account insertion back when role mapping fails later in the transaction', async () => {
    await database.query(
      `CREATE FUNCTION reject_test_mapping() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test mapping failure'; END $$`,
    );
    await database.query(
      'CREATE TRIGGER reject_test_mapping BEFORE INSERT ON user_roles FOR EACH ROW EXECUTE FUNCTION reject_test_mapping()',
    );
    try {
      await expect(
        new TypeormAccountImportRepository(database).createAll(
          [
            {
              row: 2,
              studentId: 'rollback',
              displayName: 'Rollback',
              email: 'rollback@sv1.dut.udn.vn',
              role: RoleName.Student,
              passwordHash,
            },
          ],
          adminId,
        ),
      ).rejects.toMatchObject({ code: 'dependency_unavailable' });
      expect(await database.getRepository(User).count()).toBe(1);
    } finally {
      await database.query('DROP TRIGGER reject_test_mapping ON user_roles');
      await database.query('DROP FUNCTION reject_test_mapping()');
    }
  });

  it('keeps seed idempotent and preserves existing catalog descriptions/custom data', async () => {
    await database.query(
      "UPDATE permissions SET description = 'existing description' WHERE code = 'user:import'",
    );
    await database.query("INSERT INTO permissions (code) VALUES ('fixture:custom')");
    const before = await database.query<unknown[]>('SELECT * FROM permissions ORDER BY code');
    const mappings = await database.query<unknown[]>(
      'SELECT * FROM role_permissions ORDER BY role_id, permission_id',
    );
    await database.transaction(seedRbac);
    expect(await database.query('SELECT * FROM permissions ORDER BY code')).toEqual(before);
    expect(
      await database.query('SELECT * FROM role_permissions ORDER BY role_id, permission_id'),
    ).toEqual(mappings);
    await database.query(
      `INSERT INTO role_permissions SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.name = 'STUDENT' AND p.code = 'problem:create'`,
    );
    try {
      await expect(database.transaction(seedRbac)).rejects.toThrow('remediation');
      expect(await database.query('SELECT * FROM permissions ORDER BY code')).toEqual(before);
    } finally {
      await database.query(
        `DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE name = 'STUDENT') AND permission_id IN (SELECT id FROM permissions WHERE code = 'problem:create')`,
      );
    }
  });
});
