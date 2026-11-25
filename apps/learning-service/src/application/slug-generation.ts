import { randomBytes } from 'node:crypto';

export const SLUG_ATTEMPTS = 20;
const MAX_SLUG_LENGTH = 220;

export function createSlugBase(title: string, fallback: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Mark}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  // A slug shaped like a UUID would be interpreted as a record ID.
  if (/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(slug)) {
    return `${fallback}-${slug}`;
  }
  return slug || fallback;
}

export function createSlugCandidate(base: string, collisionCount: number): string {
  const suffix =
    collisionCount === 0
      ? ''
      : collisionCount < 10
        ? `-${collisionCount + 1}`
        : `-${randomBytes(6).toString('hex')}`;

  return base.slice(0, MAX_SLUG_LENGTH - suffix.length).replace(/-+$/, '') + suffix;
}
