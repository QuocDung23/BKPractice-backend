import type { ApiErrorBody } from '@app/contracts';
import type { ArgumentsHost } from '@nestjs/common';

export interface FakeHttpHost {
  host: ArgumentsHost;
  status: () => number;
  body: () => ApiErrorBody;
}

/** Host HTTP giả đủ cho `sendApiError`: có request (method, headers) và response (setHeader, status, json). */
export function createFakeHttpHost(headers: Record<string, string> = {}): FakeHttpHost {
  let status = 0;
  let body: ApiErrorBody | undefined;
  const response = {
    setHeader: jest.fn(),
    status(code: number) {
      status = code;
      return {
        json: (payload: ApiErrorBody) => {
          body = payload;
        },
      };
    },
  };
  const request = { method: 'GET', headers };
  const host = {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ArgumentsHost;
  return {
    host,
    status: () => status,
    body: () => {
      if (!body) throw new Error('no error body was written');
      return body;
    },
  };
}
