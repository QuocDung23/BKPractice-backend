import type { ApiErrorBody } from '@app/contracts';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IsEmail, MinLength } from 'class-validator';

import { AllExceptionsFilter } from './all-exceptions.filter';
import { createValidationPipe } from './validation-errors';

class SignupDto {
  @IsEmail() email!: string;
  @MinLength(8) password!: string;
}

@Controller()
class SampleController {
  @Post('signup')
  signup(@Body() dto: SignupDto): SignupDto {
    return dto;
  }

  @Get('item/:id')
  item(@Param('id', ParseUUIDPipe) id: string): { id: string } {
    return { id };
  }

  @Get('boom')
  boom(): never {
    throw new Error('SELECT * FROM users WHERE password_hash = x');
  }

  @Get('forbidden')
  forbidden(): never {
    throw new ForbiddenException();
  }
}

const UUID = '0b8f3a52-6c1d-4e7a-9b2f-3d5e8a1c4f70';

/** Chạy qua Express thật để kiểm tra cả lỗi sinh ra trước controller (body-parser, route, pipe). */
describe('Định dạng lỗi chung qua HTTP thật (ERR-001 AC-001, AC-006, AC-007)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [SampleController] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0, '127.0.0.1');
    baseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1');
  });

  afterAll(() => app.close());

  async function call(path: string, init?: RequestInit) {
    const response = await fetch(`${baseUrl}${path}`, init);
    const text = await response.text();
    return { status: response.status, type: response.headers.get('content-type') ?? '', text };
  }

  function expectEnvelope(result: { status: number; type: string; text: string }): ApiErrorBody {
    expect(result.type).toContain('application/json');
    const body = JSON.parse(result.text) as ApiErrorBody;
    expect(body.statusCode).toBe(result.status);
    expect(typeof body.code).toBe('string');
    expect(typeof body.message).toBe('string');
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    return body;
  }

  it('JSON sai cú pháp trả INVALID_JSON thay vì trang HTML mặc định', async () => {
    const body = expectEnvelope(
      await call('/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"email": ',
      }),
    );
    expect(body.code).toBe('INVALID_JSON');
  });

  it('liệt kê từng trường sai và không lặp lại giá trị đã nhập', async () => {
    const result = await call('/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'khong-phai-email', password: 'hunter2', extra: 1 }),
    });
    const body = expectEnvelope(result);
    expect(result.status).toBe(400);
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.details?.map((item) => item.field).sort()).toEqual(['email', 'extra', 'password']);
    expect(result.text).not.toContain('hunter2');
  });

  it('route không tồn tại có thông báo tiếng Việt', async () => {
    const body = expectEnvelope(await call('/khong-co'));
    expect(body.code).toBe('NOT_FOUND');
    expect(body.message).toBe('Không tìm thấy đường dẫn: GET /khong-co.');
  });

  it('UUID sai trên đường dẫn trả INVALID_PARAMETER', async () => {
    const body = expectEnvelope(await call('/item/123'));
    expect(body.code).toBe('INVALID_PARAMETER');
    expect(body.message).toContain('UUID');
  });

  it('Nest ForbiddenException mặc định được Việt hóa', async () => {
    const body = expectEnvelope(await call('/forbidden'));
    expect(body.message).toBe('Bạn không có quyền thực hiện thao tác này.');
  });

  it('lỗi lạ trả 500 không lộ nội bộ và giữ x-request-id dạng UUID', async () => {
    const result = await call('/boom', { headers: { 'x-request-id': UUID } });
    const body = expectEnvelope(result);
    expect(result.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body.requestId).toBe(UUID);
    expect(result.text).not.toMatch(/SELECT|password_hash/);
  });

  it('thành công vẫn trả dữ liệu bình thường', async () => {
    const result = await call(`/item/${UUID}`);
    expect(result.status).toBe(200);
    expect(JSON.parse(result.text)).toEqual({ id: UUID });
  });
});
