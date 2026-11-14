import { randomUUID } from 'node:crypto';

import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';

import { InitialIdentitySchema1700000000000 } from './migrations/1700000000000-InitialIdentitySchema';
import { AddStudentMicrosoftAuthentication1700000000001 } from './migrations/1700000000001-AddStudentMicrosoftAuthentication';
import { AddAuthSessions1700000000003 } from './migrations/1700000000003-AddAuthSessions';

import { AddOfficialAccountName1700000000004 } from '@/database/migrations/1700000000004-AddOfficialAccountName';
import { AddSystemAccount1700000000005 } from '@/database/migrations/1700000000005-AddSystemAccount';
import {
  TypeormAuthAccountRepository,
  TypeormExternalIdentityRepository,
  TypeormRefreshSessionRepository,
} from '@/modules/auth/infrastructure/persistence';
import { Argon2PasswordHasher } from '@/modules/auth/infrastructure/security';
import { identityEntities } from '@/modules/identity.entities';
import { TypeormEffectivePermissionReader } from '@/modules/rbac/infrastructure/effective-permission-reader';
import { User } from '@/modules/users/infrastructure/persistence';

const testUrl = process.env.TEST_IDENTITY_DATABASE_URL;
const describeDatabase = testUrl ? describe : describe.skip;

describeDatabase('Identity auth migration and session repository', () => {
  let database: DataSource;
  let firstUserId: string;
  let secondUserId: string;

  beforeAll(async () => {
    if (!testUrl || !new URL(testUrl).pathname.endsWith('_test')) {
      throw new Error('TEST_IDENTITY_DATABASE_URL must name an isolated _test database');
    }
    database = new DataSource({
      type: 'postgres',
      url: testUrl,
      entities: identityEntities,
      migrations: [
        InitialIdentitySchema1700000000000,
        AddStudentMicrosoftAuthentication1700000000001,
        AddAuthSessions1700000000003,
        AddOfficialAccountName1700000000004,
        AddSystemAccount1700000000005,
      ],
      synchronize: false,
    });
    await database.initialize();
    await database.dropDatabase();
    await database.runMigrations({ transaction: 'all' });
    for (let index = 0; index < 4; index++)
      await database.undoLastMigration({ transaction: 'all' });
    firstUserId = randomUUID();
    secondUserId = randomUUID();
    const hash = await argon2.hash('123456');
    await database.query(
      `INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3), ($4, $5, $3)`,
      [firstUserId, 'student1@school.edu', hash, secondUserId, 'student2@school.edu'],
    );
    await database.query(
      `INSERT INTO refresh_tokens (token_id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, now() + interval '1 day'), ($4, $5, $3, now() + interval '1 day')`,
      [randomUUID(), firstUserId, hash, randomUUID(), secondUserId],
    );
  });

  afterAll(async () => {
    if (database?.isInitialized) await database.destroy();
  });

  it('runs, reverts, and reruns while backfilling distinct families', async () => {
    await database.runMigrations({ transaction: 'all' });
    const rows: { family_id: string }[] = await database.query(
      `SELECT family_id FROM refresh_tokens`,
    );
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.family_id)).size).toBe(2);
    const sessions: { id: string; client_type: string }[] = await database.query(
      `SELECT id, client_type FROM sessions`,
    );
    expect(sessions).toHaveLength(2);
    expect(sessions.every((session) => session.client_type === 'web')).toBe(true);
    await expect(
      database.query(`INSERT INTO users (email, password_hash) VALUES ($1, $2)`, [
        'STUDENT1@school.edu',
        'hash',
      ]),
    ).rejects.toBeDefined();
    for (let index = 0; index < 4; index++)
      await database.undoLastMigration({ transaction: 'all' });
    const columns: { column_name: string }[] = await database.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'refresh_tokens' AND column_name = 'family_id'`,
    );
    expect(columns).toHaveLength(0);
    await database.runMigrations({ transaction: 'all' });
  });

  it('allows one refresh rotation and isolates independently logged-in families', async () => {
    const repository = new TypeormRefreshSessionRepository(database, new Argon2PasswordHasher());
    const familyId = randomUUID();
    const independentFamilyId = randomUUID();
    const current = {
      sub: firstUserId,
      jti: randomUUID(),
      fid: familyId,
      type: 'refresh' as const,
      exp: 9999999999,
    };
    const expiresAt = new Date(Date.now() + 60_000);
    await repository.create({
      tokenId: current.jti,
      familyId,
      userId: firstUserId,
      tokenHash: await argon2.hash('current'),
      expiresAt,
    });
    await repository.create({
      tokenId: randomUUID(),
      familyId: independentFamilyId,
      userId: firstUserId,
      tokenHash: await argon2.hash('independent'),
      expiresAt,
    });
    const replacements = await Promise.all(
      [1, 2].map(async () => ({
        tokenId: randomUUID(),
        familyId,
        userId: firstUserId,
        tokenHash: await argon2.hash('replacement'),
        expiresAt,
      })),
    );
    const results = await Promise.all(
      replacements.map((record) => repository.rotate(current, 'current', record)),
    );
    expect(results.sort()).toEqual([false, true]);
    const active: { family_id: string }[] = await database.query(
      `SELECT family_id FROM refresh_tokens WHERE revoked_at IS NULL AND family_id = ANY($1)`,
      [[familyId, independentFamilyId]],
    );
    expect(active.map((row) => row.family_id)).toEqual([independentFamilyId]);
    expect(await repository.isActive(firstUserId, familyId)).toBe(false);
    expect(await repository.isActive(firstUserId, independentFamilyId)).toBe(true);
  });

  it('loads a preprovisioned student by MSSV or email without exposing the password hash in other projections', async () => {
    await database.query(`UPDATE users SET student_id = '2210001' WHERE id = $1`, [firstUserId]);
    await database.query(`UPDATE users SET student_id = '2210002' WHERE id = $1`, [secondUserId]);
    await expect(
      database.query(`UPDATE users SET student_id = '2210001' WHERE id = $1`, [secondUserId]),
    ).rejects.toBeDefined();
    const repository = new TypeormAuthAccountRepository(database.getRepository(User));
    const local = await repository.findByIdentifier('2210001');
    expect(local?.userId).toBe(firstUserId);
    expect(await argon2.verify(local?.passwordHash ?? '', '123456')).toBe(true);
    expect((await repository.findByIdentifier('STUDENT1@SCHOOL.EDU'))?.userId).toBe(firstUserId);
    expect(await repository.findByIdentifier('missing')).toBeNull();
    await expect(repository.findById(firstUserId)).resolves.not.toHaveProperty('passwordHash');
  });

  it('findForLogin tells missing, live and soft-deleted accounts apart (ERR-001 FR-007)', async () => {
    await database.query(`UPDATE users SET student_id = '2210001' WHERE id = $1`, [firstUserId]);
    const repository = new TypeormAuthAccountRepository(database.getRepository(User));
    try {
      await expect(repository.findForLogin('missing')).resolves.toEqual({ kind: 'none' });
      await expect(repository.findForLogin('2210001')).resolves.toMatchObject({
        kind: 'found',
        deleted: false,
      });
      await database.query(`UPDATE users SET deleted_at = now() WHERE id = $1`, [firstUserId]);
      const removed = await repository.findForLogin('2210001');
      expect(removed).toMatchObject({ kind: 'found', deleted: true });
      expect(removed.kind === 'found' ? removed.account.userId : undefined).toBe(firstUserId);
    } finally {
      await database.query(`UPDATE users SET deleted_at = NULL WHERE id = $1`, [firstUserId]);
    }
  });

  it('revokes only the current family on logout', async () => {
    const repository = new TypeormRefreshSessionRepository(database, new Argon2PasswordHasher());
    const familyId = randomUUID();
    const otherFamilyId = randomUUID();
    const tokenId = randomUUID();
    const expiresAt = new Date(Date.now() + 60_000);
    await repository.create({
      tokenId,
      familyId,
      userId: firstUserId,
      tokenHash: await argon2.hash('logout-refresh'),
      expiresAt,
    });
    await repository.create({
      tokenId: randomUUID(),
      familyId: otherFamilyId,
      userId: firstUserId,
      tokenHash: await argon2.hash('other-refresh'),
      expiresAt,
    });
    const claims = {
      sub: firstUserId,
      jti: tokenId,
      fid: familyId,
      type: 'refresh' as const,
      exp: 9999999999,
    };
    await repository.revokeFamily(claims, 'wrong-token');
    let active: { family_id: string }[] = await database.query(
      `SELECT family_id FROM refresh_tokens WHERE family_id = $1 AND revoked_at IS NULL`,
      [familyId],
    );
    expect(active).toHaveLength(1);
    await repository.revokeFamily(claims, 'logout-refresh');
    await repository.revokeFamily(claims, 'logout-refresh');
    active = await database.query(
      `SELECT family_id FROM refresh_tokens WHERE family_id = ANY($1) AND revoked_at IS NULL`,
      [[familyId, otherFamilyId]],
    );
    expect(active.map((row) => row.family_id)).toEqual([otherFamilyId]);
  });

  it('leaves no active token when logout races with refresh', async () => {
    const repository = new TypeormRefreshSessionRepository(database, new Argon2PasswordHasher());
    const familyId = randomUUID();
    const current = {
      sub: firstUserId,
      jti: randomUUID(),
      fid: familyId,
      type: 'refresh' as const,
      exp: 9999999999,
    };
    const expiresAt = new Date(Date.now() + 60_000);
    await repository.create({
      tokenId: current.jti,
      familyId,
      userId: firstUserId,
      tokenHash: await argon2.hash('racing-refresh'),
      expiresAt,
    });
    await Promise.all([
      repository.rotate(current, 'racing-refresh', {
        tokenId: randomUUID(),
        familyId,
        userId: firstUserId,
        tokenHash: await argon2.hash('replacement'),
        expiresAt,
      }),
      repository.revokeFamily(current, 'racing-refresh'),
    ]);
    const active: { token_id: string }[] = await database.query(
      `SELECT token_id FROM refresh_tokens WHERE family_id = $1 AND revoked_at IS NULL`,
      [familyId],
    );
    expect(active).toHaveLength(0);
  });

  it('makes access sessions inactive immediately after logout-all', async () => {
    const repository = new TypeormRefreshSessionRepository(database, new Argon2PasswordHasher());
    const first = randomUUID();
    const second = randomUUID();
    const anotherUser = randomUUID();
    const expiresAt = new Date(Date.now() + 60_000);
    await repository.create({
      tokenId: randomUUID(),
      familyId: first,
      userId: firstUserId,
      tokenHash: await argon2.hash('first'),
      expiresAt,
    });
    await repository.create({
      tokenId: randomUUID(),
      familyId: second,
      userId: firstUserId,
      tokenHash: await argon2.hash('second'),
      expiresAt,
    });
    await repository.create({
      tokenId: randomUUID(),
      familyId: anotherUser,
      userId: secondUserId,
      tokenHash: await argon2.hash('other'),
      expiresAt,
    });
    expect(await repository.isActive(firstUserId, first)).toBe(true);
    expect(await repository.isActive(firstUserId, second)).toBe(true);
    await repository.revokeAll(firstUserId);
    expect(await repository.isActive(firstUserId, first)).toBe(false);
    expect(await repository.isActive(firstUserId, second)).toBe(false);
    expect(await repository.isActive(secondUserId, anotherUser)).toBe(true);
  });

  it('links one preprovisioned account and later resolves it by stable Microsoft IDs', async () => {
    const repository = new TypeormExternalIdentityRepository(database);
    const identity = {
      tenantId: randomUUID(),
      objectId: randomUUID(),
      username: 'student1@school.edu',
    };
    expect((await repository.resolveOrLink(identity))?.userId).toBe(firstUserId);
    await database.query(`UPDATE users SET email = $1 WHERE id = $2`, [
      'renamed@school.edu',
      firstUserId,
    ]);
    expect((await repository.resolveOrLink(identity))?.userId).toBe(firstUserId);
    expect(
      await repository.resolveOrLink({
        ...identity,
        objectId: randomUUID(),
        username: 'renamed@school.edu',
      }),
    ).toBeNull();
    expect(
      await repository.resolveOrLink({
        ...identity,
        username: 'unprovisioned@school.edu',
        objectId: randomUUID(),
      }),
    ).toBeNull();
  });

  it('reads sorted and unique effective permissions from all user roles', async () => {
    const roles: { id: string; name: string }[] = await database.query(
      `SELECT id, name FROM roles WHERE name IN ('STUDENT', 'LECTURER')`,
    );
    await database.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2), ($1, $3)`, [
      firstUserId,
      roles.find((role) => role.name === 'STUDENT')?.id,
      roles.find((role) => role.name === 'LECTURER')?.id,
    ]);
    const createId = randomUUID();
    const publishId = randomUUID();
    await database.query(
      `INSERT INTO permissions (id, code) VALUES ($1, 'problem:publish'), ($2, 'problem:create')`,
      [publishId, createId],
    );
    await database.query(
      `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2), ($1, $3)`,
      [roles.find((role) => role.name === 'LECTURER')?.id, publishId, createId],
    );
    expect(await new TypeormEffectivePermissionReader(database).readForUser(firstUserId)).toEqual([
      'problem:create',
      'problem:publish',
    ]);
  });
});
