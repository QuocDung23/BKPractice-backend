import type { OpenAPIObject } from '@nestjs/swagger';

import { ApiErrorResponseDto } from './api-error.dto';

const SCHEMA_REF = `#/components/schemas/${ApiErrorResponseDto.name}`;
const DEFAULT_DESCRIPTION =
  'Lỗi. Mọi lỗi dùng chung định dạng ApiErrorResponseDto; dựa vào `code` để biết nguyên nhân cụ thể.';
const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const;

interface ResponseObject {
  description?: string;
  content?: Record<string, unknown>;
}

/**
 * Gắn schema lỗi chung vào mọi thao tác của tài liệu OpenAPI (spec ERR-001 FR-013): mỗi phản hồi 4xx/5xx
 * đã được mô tả bằng chữ nhận thêm schema, và thao tác nào chưa có phản hồi lỗi nào nhận phản hồi `default`.
 */
export function applyApiErrorSchema(document: OpenAPIObject): OpenAPIObject {
  const content = { 'application/json': { schema: { $ref: SCHEMA_REF } } };
  for (const item of Object.values(document.paths ?? {})) {
    for (const method of METHODS) {
      const operation = item[method];
      if (!operation) continue;
      const responses = (operation.responses ??= {}) as Record<string, ResponseObject>;
      let hasError = false;
      for (const [status, response] of Object.entries(responses)) {
        if (!/^[45]\d\d$/.test(status) && status !== 'default') continue;
        hasError = true;
        response.content ??= content;
      }
      if (!hasError) responses.default = { description: DEFAULT_DESCRIPTION, content };
    }
  }
  return document;
}
