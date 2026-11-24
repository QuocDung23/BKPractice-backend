import 'reflect-metadata';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import identityDataSource from '@identity/database/data-source';
import { seedRbac } from '@identity/database/seed-rbac';
import * as argon2 from 'argon2';
import { type EntityManager } from 'typeorm';

import { SeedDataError, stableUuid } from '../seed-utils';

export interface DemoUser {
  id: string;
  studentId: string | null;
  displayName: string;
  email: string;
  role: 'STUDENT' | 'LECTURER';
  bio?: string;
}

function readStudentCount(): number {
  const count = Number(process.env.SEED_DEMO_STUDENTS ?? '200');
  if (!Number.isInteger(count) || count < 1 || count > 1000) {
    throw new SeedDataError('SEED_DEMO_STUDENTS must be an integer from 1 to 1000.');
  }
  return count;
}

export function readDemoUsers(studentCount = readStudentCount()): DemoUser[] {
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
  const surnames = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Võ', 'Đặng', 'Phan', 'Bùi', 'Đỗ'];
  const middleNames = ['Minh', 'Gia', 'Thanh', 'Khánh', 'Hải', 'Nhật', 'Ngọc'];
  const givenNames = ['An', 'Bảo', 'Chi', 'Duy', 'Giang', 'Hà', 'Huy', 'Linh', 'Nam', 'Vy'];
  return users.concat(
    Array.from({ length: studentCount + 12 }, (_, index): DemoUser => {
      const isLecturer = index >= studentCount;
      const number = isLecturer ? index - studentCount + 1 : index + 1;
      const suffix = String(number).padStart(4, '0');
      const key = isLecturer ? `lecturer-${suffix}` : `student-${suffix}`;
      const nameIndex = isLecturer ? number + 39 : number - 1;
      return {
        id: stableUuid(`ui-seed:identity:${key}`),
        studentId: isLecturer ? null : `99000${suffix}`,
        displayName: [
          surnames[nameIndex % surnames.length],
          middleNames[Math.floor(nameIndex / surnames.length) % middleNames.length],
          givenNames[
            Math.floor(nameIndex / (surnames.length * middleNames.length)) % givenNames.length
          ],
        ].join(' '),
        email: `${key}@bkpractice.example.test`,
        role: isLecturer ? 'LECTURER' : 'STUDENT',
        bio: isLecturer
          ? 'Hồ sơ giảng viên mô phỏng dùng để kiểm thử BKPractice.'
          : 'Sinh viên mô phỏng đang luyện tập cấu trúc dữ liệu và giải thuật.',
      };
    }),
  );
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
      status: string;
      deleted_at: Date | null;
    }[] = await manager.query(
      `SELECT id, student_id, email, status, deleted_at
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

    await manager.query(
      `INSERT INTO profiles (user_id, display_name, avatar_url, bio)
       VALUES ($1, $2, NULL, $3) ON CONFLICT (user_id) DO NOTHING`,
      [user.id, user.displayName, user.bio ?? null],
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

export async function seedIdentity(users = readDemoUsers()): Promise<number> {
  const password = process.env.ACCOUNT_IMPORT_PASSWORD;
  if (!password || password.length > 128)
    throw new SeedDataError('Set a valid ACCOUNT_IMPORT_PASSWORD in the environment.');
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
