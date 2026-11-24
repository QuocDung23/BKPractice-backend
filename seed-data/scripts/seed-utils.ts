import { createHash } from 'node:crypto';

import type { EntityManager } from 'typeorm';

const namespace = Buffer.from('cbd1c9f01eb14d639c2e414ce456a502', 'hex');

export class SeedDataError extends Error {}

export function seedStride(size: number): number {
  for (let step = 37; step > 1; step--) {
    let a = size;
    let b = step;
    while (b) [a, b] = [b, a % b];
    if (a === 1) return step;
  }
  return 1;
}

export function stableUuid(name: string): string {
  const bytes = createHash('sha1').update(namespace).update(name).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Table and column names come from literals in the seed scripts. Row values are parameters.
export async function insertRows(
  manager: EntityManager,
  table: string,
  columns: string[],
  rows: unknown[][],
  conflict = '(id)',
): Promise<void> {
  const batchSize = Math.min(1000, Math.floor(60_000 / columns.length));
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const values = batch
      .map(
        (_, rowIndex) =>
          `(${columns.map((__, colIndex) => `$${rowIndex * columns.length + colIndex + 1}`).join(',')})`,
      )
      .join(',');
    await manager.query(
      `INSERT INTO ${table} (${columns.join(',')}) VALUES ${values} ON CONFLICT ${conflict} DO NOTHING`,
      batch.flat(),
    );
  }
}
