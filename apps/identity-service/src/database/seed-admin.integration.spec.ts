import { randomUUID } from 'node:crypto';

import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';

import { readSeedAdminConfig, seedAdmin } from '@/database/seed-admin';
import { seedRbac } from '@/database/seed-rbac';
import type { AccountImportRow } from '@/modules/auth/domain';
import {
  TypeormAccountImportRepository,
  TypeormAuthAccountRepository,
  TypeormExternalIdentityRepository,
} from '@/modules/auth/infrastructure/persistence';
import { identityEntities } from '@/modules/identity.entities';
import { TypeormProfileAccountContext } from '@/modules/profiles/infrastructure/persistence';
import { AssignRoleToUser, GetUserRoles, RevokeRoleFromUser } from '@/modules/rbac/application';
import { RbacFailure, RoleName, rbacPermissionCatalog } from '@/modules/rbac/domain';
import {
  TypeormEffectivePermissionReader,
  TypeormRbacRepository,
  TypeormRbacTransactionRunner,
} from '@/modules/rbac/infrastructure';
import { User } from '@/modules/users/infrastructure/persistence';

const testUrl = process.env.ACCOUNT_IMPORT_TEST_DATABASE_URL;
const databaseTests = testUrl ? describe : describe.skip;

databaseTests('bootstrap administrator — isolated PostgreSQL', () => {
  const schema = `seed_admin_${randomUUID().replaceAll('-', '')}`;
  const config = readSeedAdminConfig({
    SEED_ADMIN_LOGIN_ID: 'admin',
    SEED_ADMIN_EMAIL: 'admin@example.invalid',
    SEED_ADMIN_PASSWORD: 'admin',
  });
  let root: DataSource;
  let database: DataSource;

  beforeAll(async () => {
    if (!testUrl || !new URL(testUrl).pathname.endsWith('_test'))
      throw new Error('Use an isolated _test database');
    root = new DataSource({ type: 'postgres', url: testUrl, synchronize: false });
    await root.initialize();
    await root.query('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public');
    await root.query(`CREATE SCHEMA "${schema}"`);
    database = new DataSource({
      type: 'postgres',
      url: testUrl,
      schema,
      entities: identityEntities,
      migrations: ['apps/identity-service/src/database/migrations/*.ts'],
      migrationsRun: true,
      synchronize: false,
      extra: { options: `-c search_path=${schema},public` },
    });
    await database.initialize();
  }, 30000);

  afterAll(async () => {
    if (database?.isInitialized) await database.destroy();
    if (root?.isInitialized) {
      await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await root.destroy();
    }
  });

  it('creates one hidden Admin, keeps its hash on rerun and rejects conflicting credentials', async () => {
    await database.transaction(async (manager) => {
      await seedRbac(manager);
      await seedAdmin(manager, config);
    });
    const first: { id: string; password_hash: string; status: string }[] = await database.query(
      'SELECT id, password_hash, status FROM users WHERE is_system_account = true',
    );
    expect(first).toHaveLength(1);
    expect(first[0]?.status).toBe('ACTIVE');
    expect(await argon2.verify(first[0]!.password_hash, config.password)).toBe(true);
    const roles: { name: string }[] = await database.query(
      'SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1',
      [first[0]!.id],
    );
    expect(roles).toEqual([{ name: 'ADMIN' }]);
    expect(await new TypeormEffectivePermissionReader(database).readForUser(first[0]!.id)).toEqual(
      rbacPermissionCatalog
        .filter(({ role }) => role === RoleName.Admin)
        .map(({ code }) => code)
        .sort(),
    );
    const accounts = new TypeormAuthAccountRepository(database.getRepository(User));
    expect(await accounts.findByIdentifier(config.loginId)).toEqual(
      expect.objectContaining({
        userId: first[0]!.id,
        studentId: config.loginId,
        roles: ['ADMIN'],
      }),
    );
    expect(await accounts.findByIdentifier(config.email)).toBeNull();
    const importRepository = new TypeormAccountImportRepository(database);
    const importRow: AccountImportRow = {
      row: 2,
      studentId: config.loginId,
      displayName: 'Another user',
      email: config.email,
      role: RoleName.Student,
    };
    expect(await importRepository.findConflicts([importRow])).toEqual([]);
    await expect(
      importRepository.createAll(
        [{ ...importRow, passwordHash: 'unused-test-hash' }],
        first[0]!.id,
      ),
    ).rejects.toMatchObject({
      code: 'conflict',
      issues: [{ row: 0, field: 'row', code: 'concurrent_conflict' }],
    });

    await database.transaction(async (manager) => {
      await seedRbac(manager);
      await seedAdmin(manager, config);
    });
    expect(
      await database.query(
        'SELECT id, password_hash, status FROM users WHERE is_system_account = true',
      ),
    ).toEqual(first);
    await expect(
      database.transaction(async (manager) => {
        await seedRbac(manager);
        await seedAdmin(manager, { ...config, loginId: 'different' });
      }),
    ).rejects.toThrow('conflicts');
    expect(
      await database.query('SELECT COUNT(*)::int AS count FROM users WHERE is_system_account'),
    ).toEqual([{ count: 1 }]);
    await expect(
      database.transaction(async (manager) => {
        await manager.query(
          `INSERT INTO user_roles (user_id, role_id)
           SELECT $1, id FROM roles WHERE name = 'LECTURER'`,
          [first[0]!.id],
        );
        await seedAdmin(manager, config);
      }),
    ).rejects.toThrow('remediation');
    expect(
      await database.query(
        'SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1',
        [first[0]!.id],
      ),
    ).toEqual([{ name: 'ADMIN' }]);

    const profile = new TypeormProfileAccountContext(database);
    const rbac = new TypeormRbacRepository(database.manager);
    expect(await profile.findAccount(first[0]!.id)).toBeNull();
    expect(await rbac.findUserRoles(first[0]!.id)).toBeNull();
    const actor = { userId: randomUUID(), roles: [RoleName.Admin], permissions: [] };
    const transactions = new TypeormRbacTransactionRunner(database);
    await expect(new GetUserRoles(rbac).execute(actor, first[0]!.id)).rejects.toEqual(
      new RbacFailure('user_not_found'),
    );
    await expect(
      new AssignRoleToUser(transactions).execute(
        actor,
        first[0]!.id,
        RoleName.Lecturer,
        'Test role change',
      ),
    ).rejects.toEqual(new RbacFailure('user_not_found'));
    await expect(
      new RevokeRoleFromUser(transactions).execute(
        actor,
        first[0]!.id,
        RoleName.Student,
        'Test role change',
      ),
    ).rejects.toEqual(new RbacFailure('user_not_found'));
    expect(
      await new TypeormExternalIdentityRepository(database).resolveOrLink({
        tenantId: randomUUID(),
        objectId: randomUUID(),
        username: config.email,
      }),
    ).toBeNull();

    const linked = { tenantId: randomUUID(), objectId: randomUUID() };
    await database.query(
      `INSERT INTO external_identities
       (user_id, provider, provider_tenant_id, provider_subject_id, provider_username_at_link)
       VALUES ($1, 'MICROSOFT', $2, $3, $4)`,
      [first[0]!.id, linked.tenantId, linked.objectId, config.email],
    );
    expect(
      await new TypeormExternalIdentityRepository(database).resolveOrLink({
        ...linked,
        username: config.email,
      }),
    ).toBeNull();
  }, 30000);
});
