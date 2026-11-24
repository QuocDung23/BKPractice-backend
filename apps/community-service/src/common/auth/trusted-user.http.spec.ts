import { createValidationPipe } from '@app/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { TrustedUserGuard } from '@/common/auth';
import { EditContent } from '@/modules/posts/application';
import { PostsController } from '@/modules/posts/posts.controller';
import { PostsService } from '@/modules/posts/posts.service';

const userId = '11111111-1111-4111-8111-111111111111';
const credential = 'test-community-secret-32-characters';
const posts = {
  list: jest.fn().mockResolvedValue([]),
  create: jest.fn().mockResolvedValue({ id: 'post' }),
  comment: jest.fn().mockResolvedValue({ id: 'comment' }),
  setPostLike: jest.fn().mockResolvedValue({ liked: true }),
};

describe('Community trusted Gateway boundary', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PostsController],
      providers: [
        { provide: EditContent, useValue: { execute: jest.fn() } },
        TrustedUserGuard,
        { provide: PostsService, useValue: posts },
        {
          provide: ConfigService,
          useValue: new ConfigService({ COMMUNITY_GATEWAY_SECRET: credential }),
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ['GET', ''],
    ['POST', ''],
    ['POST', '/post/comments'],
    ['PUT', '/post/reactions/like'],
    ['DELETE', '/post/reactions/like'],
  ])('rejects forged identity on %s %s before business logic', async (method, suffix) => {
    const response = await fetch(`${baseUrl}/api/community/posts${suffix}`, {
      method,
      headers: { 'x-auth-user-id': userId },
    });
    expect(response.status).toBe(401);
    Object.values(posts).forEach((operation) => expect(operation).not.toHaveBeenCalled());
  });

  it.each<Record<string, string>>([
    { 'x-auth-user-id': userId, 'x-internal-community-secret': 'wrong' },
    { 'x-auth-user-id': 'not-a-uuid', 'x-internal-community-secret': credential },
    { 'x-internal-community-secret': credential },
  ])('rejects invalid credentials or principal', async (headers) => {
    const response = await fetch(`${baseUrl}/api/community/posts`, { headers });
    expect(response.status).toBe(401);
    expect(posts.list).not.toHaveBeenCalled();
  });

  it('accepts trusted reads and passes verified user ID to writes', async () => {
    const headers = {
      'x-auth-user-id': userId,
      'x-internal-community-secret': credential,
      'content-type': 'application/json',
    };
    const read = await fetch(`${baseUrl}/api/community/posts`, { headers });
    expect(read.status).toBe(200);
    expect(posts.list).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ page: 1, pageSize: 20 }),
    );
    const body = { scope: 'GLOBAL', content: 'hello' };
    const created = await fetch(`${baseUrl}/api/community/posts`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    expect(created.status).toBe(201);
    expect(posts.create).toHaveBeenCalledWith(userId, body);
    expect(JSON.stringify(await created.json())).not.toContain(credential);
  });
});
