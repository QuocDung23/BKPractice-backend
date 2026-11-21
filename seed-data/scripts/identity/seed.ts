import 'reflect-metadata';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import identityDataSource from '@identity/database/data-source';
import { seedRbac } from '@identity/database/seed-rbac';
import * as argon2 from 'argon2';
import { type EntityManager } from 'typeorm';

interface DemoUser {
  id: string;
  studentId: string | null;
  displayName: string;
  email: string;
  role: 'STUDENT' | 'LECTURER';
}

class SeedDataError extends Error {}

function readUsers(): DemoUser[] {
  const users = JSON.parse(
    readFileSync(resolve(process.cwd(), 'seed-data/data/identity/users.json'), 'utf8'),
  ) as DemoUser[];
  if (
    users.length !== 3 ||
    users.filter((user) => user.role === 'STUDENT').length !== 2 ||
    users.filter((user) => user.role === 'LECTURER').length !== 1 ||
    users.some((user) => !user.id || !user.displayName || !user.email)
  )
    throw new SeedDataError('Identity fixture must contain two students and one lecturer.');
  return users;
}

async function seedUsers(
  manager: EntityManager,
  users: DemoUser[],
  password: string,
): Promise<void> {
  await seedRbac(manager);
  const roles: { id: string; name: DemoUser['role'] }[] = await manager.query(
    'SELECT id, name FROM roles WHERE name::text = ANY($1::text[])',
    [[...new Set(users.map((user) => user.role))]],
  );
  const roleIds = new Map(roles.map((role) => [role.name, role.id]));
  if (roleIds.size !== 2) throw new SeedDataError('Identity is missing a required demo role.');

  for (const user of users) {
    const conflicts: {
      id: string;
      student_id: string | null;
      email: string;
      display_name: string | null;
      status: string;
      deleted_at: Date | null;
    }[] = await manager.query(
      `SELECT id, student_id, email, display_name, status, deleted_at
         FROM users
        WHERE id = $1 OR LOWER(email) = LOWER($2)
           OR ($3::varchar IS NOT NULL AND student_id = $3)
        FOR UPDATE`,
      [user.id, user.email, user.studentId],
    );

    if (conflicts.length > 1) throw new SeedDataError(`Identity conflict for ${user.email}.`);
    const existing = conflicts[0];
    if (
      existing &&
      (existing.id !== user.id ||
        existing.student_id !== user.studentId ||
        existing.email.toLowerCase() !== user.email.toLowerCase() ||
        existing.display_name !== user.displayName ||
        existing.status !== 'ACTIVE' ||
        existing.deleted_at !== null)
    )
      throw new SeedDataError(
        `Identity fixture conflicts with an existing account: ${user.email}.`,
      );

    if (!existing) {
      await manager.query(
        `INSERT INTO users (id, student_id, display_name, email, password_hash, status, is_system_account)
         VALUES ($1, $2, $3, $4, $5, 'ACTIVE', false)`,
        [user.id, user.studentId, user.displayName, user.email, await argon2.hash(password)],
      );
    }

    const profiles: { display_name: string }[] = await manager.query(
      'SELECT display_name FROM profiles WHERE user_id = $1 FOR UPDATE',
      [user.id],
    );
    if (profiles.length && profiles[0]!.display_name !== user.displayName)
      throw new SeedDataError(`Profile fixture conflicts for ${user.email}.`);
    if (!profiles.length)
      await manager.query(
        'INSERT INTO profiles (user_id, display_name, avatar_url, bio) VALUES ($1, $2, NULL, NULL)',
        [user.id, user.displayName],
      );

    const expectedRoleId = roleIds.get(user.role);
    if (!expectedRoleId) throw new SeedDataError(`Missing Identity role ${user.role}.`);
    const assigned: { name: string }[] = await manager.query(
      `SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1`,
      [user.id],
    );
    if (assigned.some((role) => role.name !== user.role))
      throw new SeedDataError(`Unexpected role assignment for ${user.email}.`);
    await manager.query(
      'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [user.id, expectedRoleId],
    );
  }
}

export async function seedIdentity(): Promise<number> {
  const password = process.env.ACCOUNT_IMPORT_PASSWORD;
  if (!password || password.length > 128)
    throw new SeedDataError('Set a valid ACCOUNT_IMPORT_PASSWORD in the environment.');
  const users = readUsers();
  await identityDataSource.initialize();
  try {
    await identityDataSource.transaction((manager) => seedUsers(manager, users, password));
  } finally {
    await identityDataSource.destroy();
  }
  return users.length;
}

if (require.main === module) {
  void seedIdentity()
    .then((count) => process.stdout.write(`${count} demo accounts ready.\n`))
    .catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof SeedDataError ? error.message : 'Identity demo seed failed; check migrations and database configuration.'}\n`,
      );
      process.exitCode = 1;
      if (identityDataSource.isInitialized) void identityDataSource.destroy();
    });
}
