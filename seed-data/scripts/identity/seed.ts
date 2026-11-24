import 'reflect-metadata';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import identityDataSource from '@identity/database/data-source';
import { seedRbac } from '@identity/database/seed-rbac';
import * as argon2 from 'argon2';
import { isUUID } from 'class-validator';
import { type EntityManager } from 'typeorm';

import { SeedDataError, stableUuid } from '../seed-utils';

interface DemoLecturer {
  id: string;
  studentId: null;
  displayName: string;
  email: string;
  role: 'LECTURER';
  bio?: string;
}

export function readDemoStudentIds(value = process.env.SEED_DEMO_STUDENT_IDS): string[] {
  if (!value?.trim()) return [];
  const ids = value.split(',').map((id) => id.trim().toLowerCase());
  if (ids.some((id) => !isUUID(id))) {
    throw new SeedDataError('SEED_DEMO_STUDENT_IDS must contain existing test student UUIDs.');
  }
  return [...new Set(ids)];
}

export function readDemoLecturers(): DemoLecturer[] {
  const lecturers = JSON.parse(
    readFileSync(resolve(process.cwd(), 'seed-data/data/identity/users.json'), 'utf8'),
  ) as DemoLecturer[];
  if (
    lecturers.length !== 1 ||
    lecturers.some(
      (user) =>
        user.role !== 'LECTURER' ||
        user.studentId !== null ||
        !user.id ||
        !user.displayName ||
        !user.email,
    )
  )
    throw new SeedDataError(
      'Identity fixture must contain the lecturer who owns the demo catalog.',
    );
  const surnames = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Võ', 'Đặng', 'Phan', 'Bùi', 'Đỗ'];
  const middleNames = ['Minh', 'Gia', 'Thanh', 'Khánh', 'Hải', 'Nhật', 'Ngọc'];
  const givenNames = ['An', 'Bảo', 'Chi', 'Duy', 'Giang', 'Hà', 'Huy', 'Linh', 'Nam', 'Vy'];
  return lecturers.concat(
    Array.from({ length: 12 }, (_, index): DemoLecturer => {
      const number = index + 1;
      const suffix = String(number).padStart(4, '0');
      const key = `lecturer-${suffix}`;
      const nameIndex = number + 39;
      return {
        id: stableUuid(`ui-seed:identity:${key}`),
        studentId: null,
        displayName: [
          surnames[nameIndex % surnames.length],
          middleNames[Math.floor(nameIndex / surnames.length) % middleNames.length],
          givenNames[
            Math.floor(nameIndex / (surnames.length * middleNames.length)) % givenNames.length
          ],
        ].join(' '),
        email: `${key}@bkpractice.example.test`,
        role: 'LECTURER',
        bio: 'Hồ sơ giảng viên mô phỏng dùng để kiểm thử BKPractice.',
      };
    }),
  );
}

async function validateExistingStudents(manager: EntityManager, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const students: { id: string }[] = await manager.query(
    `SELECT u.id FROM users u
     WHERE u.id = ANY($1::uuid[]) AND u.status = 'ACTIVE'
       AND u.deleted_at IS NULL AND u.is_system_account = false
       AND EXISTS (
         SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = u.id AND r.name = 'STUDENT'
       )`,
    [ids],
  );
  if (students.length !== ids.length) {
    throw new SeedDataError(
      'Each selected test student must be an existing, active student account.',
    );
  }
}

async function seedLecturers(
  manager: EntityManager,
  users: DemoLecturer[],
  password: string,
): Promise<void> {
  await seedRbac(manager);
  const roles: { id: string }[] = await manager.query(
    "SELECT id FROM roles WHERE name = 'LECTURER'",
  );
  const lecturerRoleId = roles[0]?.id;
  if (!lecturerRoleId) throw new SeedDataError('Identity is missing the demo lecturer role.');

  for (const user of users) {
    if (user.role !== 'LECTURER' || user.studentId !== null) {
      throw new SeedDataError('The Identity seed supports lecturer accounts only.');
    }
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
        FOR UPDATE`,
      [user.id, user.email],
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
         VALUES ($1, NULL, $2, $3, $4, 'ACTIVE', false)`,
        [user.id, user.displayName, user.email, await argon2.hash(password)],
      );
    }

    await manager.query(
      `INSERT INTO profiles (user_id, display_name, avatar_url, bio)
       VALUES ($1, $2, NULL, $3) ON CONFLICT (user_id) DO NOTHING`,
      [user.id, user.displayName, user.bio ?? null],
    );

    const assigned: { name: string }[] = await manager.query(
      `SELECT r.name FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = $1`,
      [user.id],
    );
    if (assigned.some((role) => role.name !== user.role))
      throw new SeedDataError(`Unexpected role assignment for ${user.email}.`);
    await manager.query(
      'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [user.id, lecturerRoleId],
    );
  }
}

export async function seedIdentity(
  users = readDemoLecturers(),
  studentIds: string[] = [],
): Promise<number> {
  const password = process.env.ACCOUNT_IMPORT_PASSWORD;
  if (!password || password.length > 128)
    throw new SeedDataError('Set a valid ACCOUNT_IMPORT_PASSWORD in the environment.');
  await identityDataSource.initialize();
  try {
    await identityDataSource.transaction(async (manager) => {
      await validateExistingStudents(manager, studentIds);
      await seedLecturers(manager, users, password);
    });
  } finally {
    await identityDataSource.destroy();
  }
  return users.length;
}

if (require.main === module) {
  void seedIdentity()
    .then((count) => process.stdout.write(`${count} demo lecturer accounts ready.\n`))
    .catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof SeedDataError ? error.message : 'Identity demo seed failed; check migrations and database configuration.'}\n`,
      );
      process.exitCode = 1;
      if (identityDataSource.isInitialized) void identityDataSource.destroy();
    });
}
