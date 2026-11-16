import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';

import { AuthTokenIssuer } from '@/modules/auth/application';
import {
  TypeormAuthAccountRepository,
  TypeormRefreshSessionRepository,
} from '@/modules/auth/infrastructure/persistence';
import { Argon2PasswordHasher, JwtBkTokenService } from '@/modules/auth/infrastructure/security';
import { identityEntities } from '@/modules/identity.entities';
import {
  AssignRoleToUser,
  EvaluateAuthorization,
  RevokeRoleFromUser,
} from '@/modules/rbac/application';
import { RoleName, type AuthorizationPrincipal } from '@/modules/rbac/domain';
import {
  BkAuthorizationPrincipalProvider,
  TypeormEffectivePermissionReader,
  TypeormRbacRepository,
  TypeormRbacTransactionRunner,
} from '@/modules/rbac/infrastructure';
import { User } from '@/modules/users/infrastructure/persistence';

const testUrl = process.env.TEST_RBAC_DATABASE_URL;
const describeDatabase = testUrl ? describe : describe.skip;

describeDatabase('RBAC PostgreSQL transactions (ID-003 AC-006, AC-008b–d, AC-010, AC-022)', () => {
  const schema = `rbac_test_${randomUUID().replaceAll('-', '')}`;
  const adminId = randomUUID();
  const otherAdminId = randomUUID();
  const targetId = randomUUID();
  const admin: AuthorizationPrincipal = {
    userId: adminId,
    roles: [RoleName.Admin],
    permissions: [],
  };
  let database: DataSource;
  let transactions: TypeormRbacTransactionRunner;
  let repository: TypeormRbacRepository;

  beforeAll(async () => {
    if (!testUrl || !new URL(testUrl).pathname.endsWith('_test')) {
      throw new Error('TEST_RBAC_DATABASE_URL must name an isolated _test database');
    }
    database = new DataSource({
      type: 'postgres',
      url: testUrl,
      schema,
      entities: identityEntities,
      extra: { options: `-c search_path=${schema},public` },
      migrations: ['apps/identity-service/src/database/migrations/*{.ts,.js}'],
      synchronize: false,
    });
    await database.initialize();
    await database.query(`CREATE SCHEMA "${schema}"`);
    await database.runMigrations({ transaction: 'all' });
    repository = new TypeormRbacRepository(database.manager);
    transactions = new TypeormRbacTransactionRunner(database);
  });

  beforeEach(async () => {
    // This schema is uniquely created by this suite; existing schemas are never cleared.
    await database.query(`TRUNCATE TABLE "${schema}".users CASCADE`);
    for (const [id, role] of [
      [adminId, 'ADMIN'],
      [otherAdminId, 'ADMIN'],
      [targetId, 'STUDENT'],
    ]) {
      await database.query('INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)', [
        id,
        `${id}@test.invalid`,
        'test-hash',
      ]);
      await database.query(
        'INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE name = $2',
        [id, role],
      );
    }
  });

  afterAll(async () => {
    if (database?.isInitialized) {
      await database.query(`DROP SCHEMA "${schema}" CASCADE`);
      await database.destroy();
    }
  });

  it('preserves static roles and makes repeated assignment/revocation idempotent', async () => {
    const roles = await database.query<{ name: string }[]>(
      'SELECT name FROM roles ORDER BY name::text',
    );
    expect(roles.map((role) => role.name)).toEqual(['ADMIN', 'LECTURER', 'STUDENT']);
    const assign = new AssignRoleToUser(transactions);
    await Promise.all([
      assign.execute(admin, targetId, RoleName.Lecturer, 'Test role change'),
      assign.execute(admin, targetId, RoleName.Lecturer, 'Test role change'),
    ]);
    expect((await repository.findUserRoles(targetId))?.roles).toEqual(['LECTURER', 'STUDENT']);
    const revoke = new RevokeRoleFromUser(transactions);
    await revoke.execute(admin, targetId, RoleName.Lecturer, 'Test role change');
    await revoke.execute(admin, targetId, RoleName.Lecturer, 'Test role change');
    expect((await repository.findUserRoles(targetId))?.roles).toEqual(['STUDENT']);
  });

  it('serializes concurrent cross-revocations and retains exactly one administrator', async () => {
    const revoke = new RevokeRoleFromUser(transactions);
    const results = await Promise.allSettled([
      revoke.execute(admin, otherAdminId, RoleName.Admin, 'Test role change'),
      revoke.execute(
        { ...admin, userId: otherAdminId },
        adminId,
        RoleName.Admin,
        'Test role change',
      ),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const failure = results.find((result) => result.status === 'rejected');
    expect(failure?.status === 'rejected' && failure.reason).toEqual(
      expect.objectContaining({ code: 'last_admin' }),
    );
    expect(await repository.countAdmins()).toBe(1);
  });

  it('rolls back when the target is absent', async () => {
    await expect(
      new AssignRoleToUser(transactions).execute(
        admin,
        randomUUID(),
        RoleName.Lecturer,
        'Test role change',
      ),
    ).rejects.toThrow('user_not_found');
    expect((await repository.findUserRoles(targetId))?.roles).toEqual(['STUDENT']);
  });

  it('rolls back changes when a later operation in the transaction fails', async () => {
    await expect(
      transactions.run(async (transaction) => {
        await transaction.assignRole(targetId, RoleName.Lecturer);
        throw new Error('test rollback');
      }),
    ).rejects.toThrow('test rollback');
    expect((await repository.findUserRoles(targetId))?.roles).toEqual(['STUDENT']);
  });

  it('issues changed role/permission snapshots without altering an old token', async () => {
    // Test fixture only; the production catalog migration is a separate task.
    await database.query(
      `INSERT INTO permissions (code) VALUES ('problem:create') ON CONFLICT DO NOTHING`,
    );
    await database.query(`INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
      WHERE r.name = 'LECTURER' AND p.code = 'problem:create' ON CONFLICT DO NOTHING`);
    const hasher = new Argon2PasswordHasher();
    const tokens = new JwtBkTokenService(
      new JwtService(),
      new ConfigService({
        JWT_ACCESS_SECRET: 'a'.repeat(32),
        JWT_REFRESH_SECRET: 'r'.repeat(32),
        JWT_ACCESS_TTL: '15m',
        JWT_REFRESH_TTL: '7d',
      }),
    );
    const issuer = new AuthTokenIssuer(
      tokens,
      hasher,
      new TypeormRefreshSessionRepository(database, hasher),
      new TypeormEffectivePermissionReader(database),
    );
    const accounts = new TypeormAuthAccountRepository(database.getRepository(User));
    const account = await accounts.findById(targetId);
    if (!account) throw new Error('Missing test account');
    const oldPair = await issuer.issueNewFamily(account);
    await new AssignRoleToUser(transactions).execute(
      admin,
      targetId,
      RoleName.Lecturer,
      'Test role change',
    );
    const updated = await accounts.findById(targetId);
    if (!updated) throw new Error('Missing test account');
    const newPair = await issuer.issueNewFamily(updated);
    const principals = new BkAuthorizationPrincipalProvider(tokens);
    const evaluate = new EvaluateAuthorization();
    const oldPrincipal = await principals.verifyAccess(oldPair.accessToken);
    const newPrincipal = await principals.verifyAccess(newPair.accessToken);
    expect(oldPrincipal.roles).toEqual(['STUDENT']);
    expect(evaluate.execute(oldPrincipal, 'problem:create').allowed).toBe(false);
    expect(newPrincipal.roles).toEqual(['LECTURER', 'STUDENT']);
    expect(evaluate.execute(newPrincipal, 'problem:create', true).allowed).toBe(true);
    expect(evaluate.execute(newPrincipal, 'problem:create', false).allowed).toBe(false);
    expect(await tokens.verifyRefresh(newPair.refreshToken)).not.toHaveProperty('permissions');
  });
});
