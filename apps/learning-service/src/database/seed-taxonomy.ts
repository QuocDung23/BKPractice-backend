import 'reflect-metadata';

import { DataSource, type EntityManager } from 'typeorm';

/**
 * LRN-010: the approved initial Topic catalog. The endpoint only reads, so this script is the
 * only writer of `topics` in this feature. Re-running it must not create duplicates.
 */
export const INITIAL_TOPICS = [
  'Mảng',
  'Sắp xếp',
  'Chuỗi',
  'OOP',
  'Đồ thị',
  'Cấu trúc cây',
  'Quy hoạch động',
  'Đệ quy',
  'Tìm kiếm nhị phân',
  'Ngăn xếp/Hàng đợi',
] as const;

const safeSeedFailures = new Map([
  ['Missing database configuration', 'Missing LEARNING_DATABASE_URL.'],
]);

export function describeSeedFailure(error: unknown): string {
  if (error instanceof Error) {
    const known = safeSeedFailures.get(error.message);
    if (known) return known;
  }
  const detail: unknown =
    typeof error === 'object' && error !== null && 'driverError' in error
      ? error.driverError
      : error;
  const code =
    typeof detail === 'object' && detail !== null && 'code' in detail ? detail.code : undefined;
  const message =
    typeof detail === 'object' && detail !== null && 'message' in detail
      ? detail.message
      : undefined;
  if (code === '42P01') {
    return 'Learning table topics is missing. Run pnpm migration:run:learning first.';
  }
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === '28P01' || code === '3D000') {
    return 'Cannot connect to the Learning database. Check LEARNING_DATABASE_URL and PostgreSQL.';
  }
  if (code === '22001' && typeof message === 'string' && /value too long/.test(message)) {
    return 'A topic name exceeds the 80 character limit.';
  }
  return 'Topic catalog seed failed. Check database migrations, configuration and existing topic data.';
}

export async function seedTaxonomy(manager: EntityManager): Promise<void> {
  await manager.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('learning:taxonomy-seed', 0))",
  );
  for (const name of INITIAL_TOPICS) {
    await manager.query(
      'INSERT INTO "topics" ("name") VALUES ($1) ON CONFLICT ("name") DO NOTHING',
      [name],
    );
  }
}

if (require.main === module) {
  const database = new DataSource({
    type: 'postgres',
    url: process.env.LEARNING_DATABASE_URL,
    synchronize: false,
  });
  void (async () => {
    try {
      if (!process.env.LEARNING_DATABASE_URL) throw new Error('Missing database configuration');
      await database.initialize();
      await database.transaction(async (manager) => {
        await seedTaxonomy(manager);
      });
      process.stdout.write(`${INITIAL_TOPICS.length} approved topics seeded (idempotent).\n`);
    } catch (error) {
      process.stderr.write(`${describeSeedFailure(error)} No seed changes committed.\n`);
      process.exitCode = 1;
    } finally {
      if (database.isInitialized) await database.destroy();
    }
  })();
}
