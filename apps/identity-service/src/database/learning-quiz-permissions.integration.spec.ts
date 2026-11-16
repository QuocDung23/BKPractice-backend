import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';

import { LearningQuizPermissions1700000000010 } from '@/database/migrations/1700000000010-LearningQuizPermissions';
import { seedRbac } from '@/database/seed-rbac';
import { JwtBkTokenService } from '@/modules/auth/infrastructure/security';

const url = process.env.TEST_DATABASE_URL;
if (url && !new URL(url).pathname.endsWith('_test'))
  throw new Error('Quiz RBAC test requires an isolated _test database');
const describeIntegration = url ? describe : describe.skip;
describeIntegration('Quiz Identity grant migration', () => {
  let source: DataSource;
  beforeAll(async () => {
    source = await new DataSource({ type: 'postgres', url, synchronize: false }).initialize();
  });
  afterAll(async () => {
    await source?.destroy();
  });
  it('upgrades and rolls back Identity grants without revoking pre-existing assignments', async () => {
    const runner = source.createQueryRunner();
    const query = <T>(sql: string, params?: unknown[]): Promise<T> =>
      runner.query(sql, params) as Promise<T>;
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query('CREATE SCHEMA quiz_identity_test');
      await runner.query('SET LOCAL search_path TO quiz_identity_test');
      await runner.query(
        'CREATE TABLE roles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text UNIQUE)',
      );
      await runner.query(
        'CREATE TABLE permissions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text UNIQUE)',
      );
      await runner.query(
        'CREATE TABLE role_permissions(role_id uuid,permission_id uuid,PRIMARY KEY(role_id,permission_id))',
      );
      const admin = randomUUID(),
        lecturer = randomUUID();
      await runner.query("INSERT INTO roles VALUES ($1,'ADMIN'),($2,'LECTURER')", [
        admin,
        lecturer,
      ]);
      await runner.query("INSERT INTO permissions(code) VALUES ('course:create')");
      await runner.query(
        "INSERT INTO role_permissions SELECT $1,id FROM permissions WHERE code='course:create'",
        [admin],
      );
      const migration = new LearningQuizPermissions1700000000010();
      await migration.up(runner);
      expect(
        (
          await query<{ count: string }[]>(
            "SELECT count(*) FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE p.code='quiz:clone'",
          )
        )[0]!.count,
      ).toBe('2');
      await seedRbac(runner.manager);
      await seedRbac(runner.manager);
      expect(
        (await query<{ count: string }[]>('SELECT count(*) FROM role_permissions'))[0]!.count,
      ).toBe('70');
      const grants = await query<{ code: string }[]>(
        'SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=$1',
        [lecturer],
      );
      const tokens = new JwtBkTokenService(
        new JwtService(),
        new ConfigService({
          JWT_ACCESS_SECRET: 'test-only-jwt-secret-32-characters',
          JWT_ACCESS_TTL: '15m',
        }),
      );
      const access = await tokens.signAccess(
        {
          userId: randomUUID(),
          studentId: 'lecturer-test',
          email: 'lecturer@example.test',
          status: 'ACTIVE',
          roles: ['LECTURER'],
        },
        grants.map((g) => g.code),
        randomUUID(),
      );
      const claims = await tokens.verifyAccessClaims(access);
      expect(claims.permissions).toEqual(
        expect.arrayContaining([
          'question:create',
          'quiz:publish',
          'course:update',
          'problem:update',
        ]),
      );
      expect(
        (
          await query<{ count: string }[]>(
            "SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE r.name='STUDENT'",
          )
        )[0]!.count,
      ).toBe('0');
      await migration.down(runner);
      expect(
        (await query<{ count: string }[]>('SELECT count(*) FROM role_permissions'))[0]!.count,
      ).toBe('5');
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  });
});
