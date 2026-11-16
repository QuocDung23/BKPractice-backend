import { AppHttpException } from '@app/common';
import type { Request } from 'express';

import { readTrustedOwner } from './trusted-owner.decorator';

const OWNER_ID = '11111111-2222-4333-8444-555555555555';

describe('readTrustedOwner', () => {
  it('reads the owner from the trusted header regardless of header case', () => {
    expect(readTrustedOwner(requestWith(['X-Auth-User-Id', OWNER_ID]))).toBe(OWNER_ID);
  });

  it.each([
    ['a missing header', []],
    ['an empty header', ['x-auth-user-id', '']],
    ['a non-UUID value', ['x-auth-user-id', 'owner-id']],
    ['a duplicated header', ['x-auth-user-id', OWNER_ID, 'X-Auth-User-Id', OWNER_ID]],
  ])('rejects %s', (_case, rawHeaders) => {
    expect(() => readTrustedOwner(requestWith(rawHeaders))).toThrow(AppHttpException);
    try {
      readTrustedOwner(requestWith(rawHeaders));
    } catch (error) {
      expect((error as AppHttpException).getStatus()).toBe(401);
      expect((error as AppHttpException).code).toBe('AUTH_USER_CONTEXT_MISSING');
    }
  });

  it('ignores owner values outside the trusted header', () => {
    const request = Object.assign(requestWith([]), {
      headers: { 'x-user-id': OWNER_ID },
      body: { userId: OWNER_ID },
      query: { 'x-auth-user-id': OWNER_ID },
    });

    expect(() => readTrustedOwner(request)).toThrow(AppHttpException);
  });
});

function requestWith(rawHeaders: string[]): Request {
  return { rawHeaders, headers: {}, body: {}, query: {} } as unknown as Request;
}
