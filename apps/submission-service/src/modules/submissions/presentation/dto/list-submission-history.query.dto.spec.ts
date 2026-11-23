import { ValidationPipe } from '@nestjs/common';
import type { ArgumentMetadata } from '@nestjs/common';

import { ListSubmissionHistoryQueryDto } from './list-submission-history.query.dto';

// Same options as the global pipe in libs/common/src/bootstrap.ts.
const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
const metadata: ArgumentMetadata = { type: 'query', metatype: ListSubmissionHistoryQueryDto };

function validate(query: Record<string, string>): Promise<ListSubmissionHistoryQueryDto> {
  return pipe.transform(query, metadata) as Promise<ListSubmissionHistoryQueryDto>;
}

const cursorId = 'c98be8f0-6d91-4bef-b0de-06167e1c1ce5';
const seededProblemId = '52287484-6967-5b6c-b636-1707a3049086';

describe('ListSubmissionHistoryQueryDto', () => {
  it('accepts an empty query and a full query, converting limit to a number', async () => {
    await expect(validate({})).resolves.toEqual({});
    await expect(
      validate({
        kind: 'SUBMIT',
        problemId: '6832170d-de82-41f7-a82c-57b71efbf55c',
        cursor: '2026-10-27T06:00:00.123456Z',
        cursorId,
        limit: '100',
      }),
    ).resolves.toMatchObject({ kind: 'SUBMIT', limit: 100 });
  });

  it('accepts a UUID v5 problem filter', async () => {
    await expect(validate({ problemId: seededProblemId })).resolves.toMatchObject({
      problemId: seededProblemId,
    });
  });

  it.each([
    ['a cursor without cursorId', { cursor: '2026-10-27T06:00:00.123456Z' }],
    ['a cursorId without cursor', { cursorId }],
    ['a malformed cursor', { cursor: 'yesterday', cursorId }],
    ['a UUID v5 cursorId', { cursor: '2026-10-27T06:00:00.123456Z', cursorId: seededProblemId }],
    ['an unknown kind', { kind: 'DRAFT' }],
    ['a malformed problem filter', { problemId: 'abc' }],
    ['a page larger than 100', { limit: '101' }],
    ['a page smaller than 1', { limit: '0' }],
    ['an owner parameter', { userId: '9f1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d' }],
    ['an ownerId parameter', { ownerId: '9f1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d' }],
  ])('rejects %s', async (_case, query) => {
    await expect(validate(query)).rejects.toThrow();
  });
});
