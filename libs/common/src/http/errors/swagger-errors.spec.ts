import type { OpenAPIObject } from '@nestjs/swagger';

import { applyApiErrorSchema } from './swagger-errors';

const REF = { $ref: '#/components/schemas/ApiErrorResponseDto' };

interface ResponseView {
  description?: string;
  content?: Record<string, { schema: unknown }>;
}

function responsesOf(doc: OpenAPIObject, method: 'get' | 'post'): Record<string, ResponseView> {
  return doc.paths['/x']?.[method]?.responses as Record<string, ResponseView>;
}

function documentWith(responses: Record<string, unknown>): OpenAPIObject {
  return {
    openapi: '3.0.0',
    info: { title: 't', version: '1' },
    paths: { '/x': { post: { responses }, get: { responses: { '200': { description: 'ok' } } } } },
  } as unknown as OpenAPIObject;
}

describe('applyApiErrorSchema (ERR-001 FR-013)', () => {
  it('gắn schema chung vào phản hồi lỗi chỉ có mô tả chữ, giữ nguyên mô tả cũ', () => {
    const doc = applyApiErrorSchema(
      documentWith({ '401': { description: 'AUTH_WRONG_PASSWORD hoặc AUTH_ACCOUNT_NOT_FOUND' } }),
    );
    const response = responsesOf(doc, 'post')['401'];
    expect(response?.description).toBe('AUTH_WRONG_PASSWORD hoặc AUTH_ACCOUNT_NOT_FOUND');
    expect(response?.content?.['application/json']?.schema).toEqual(REF);
  });

  it('thêm phản hồi default cho thao tác chưa có phản hồi lỗi nào, kể cả thao tác chỉ có 2xx', () => {
    const doc = applyApiErrorSchema(documentWith({ '200': { description: 'ok' } }));
    for (const method of ['post', 'get'] as const) {
      const responses = responsesOf(doc, method);
      expect(responses.default?.content?.['application/json']?.schema).toEqual(REF);
    }
  });

  it('không ghi đè schema đã khai báo riêng và không đụng phản hồi thành công', () => {
    const custom = { 'application/json': { schema: { type: 'string' } } };
    const doc = applyApiErrorSchema(
      documentWith({ '400': { description: 'x', content: custom }, '200': { description: 'ok' } }),
    );
    const responses = responsesOf(doc, 'post');
    expect(responses['400']?.content).toBe(custom);
    expect(responses['200']?.content).toBeUndefined();
    expect(responses.default).toBeUndefined();
  });
});
