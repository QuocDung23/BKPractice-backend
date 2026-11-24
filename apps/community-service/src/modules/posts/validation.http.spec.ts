import { AllExceptionsFilter, createValidationPipe } from '@app/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { TrustedUserGuard } from '@/common/auth';
import { EditContent } from '@/modules/posts/application';
import { PostsController } from '@/modules/posts/posts.controller';
import { PostsService } from '@/modules/posts/posts.service';

const userId = '11111111-1111-4111-8111-111111111111';
const postId = '22222222-2222-4222-8222-222222222222';
const targetId = '33333333-3333-4333-8333-333333333333';
const credential = 'test-community-secret-32-characters';
const posts = {
  list: jest.fn().mockResolvedValue([]),
  create: jest.fn().mockResolvedValue({ id: postId }),
  comment: jest.fn().mockResolvedValue({ id: 'comment' }),
  setPostLike: jest.fn().mockResolvedValue({ liked: true }),
};

describe('Community HTTP request validation', () => {
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
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    jest.clearAllMocks();
  });

  async function sendRequest(suffix: string, body: unknown, method = 'POST'): Promise<Response> {
    return fetch(`${baseUrl}/api/community/posts${suffix}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-auth-user-id': userId,
        'x-internal-community-secret': credential,
      },
      body: JSON.stringify(body),
    });
  }

  it.each<[string, unknown]>([
    ['empty', ''],
    ['spaces', '   '],
    ['tabs/newlines', '\t\r\n'],
    ['unicode whitespace', '\u00a0\u2003'],
    ['missing', undefined],
    ['null', null],
    ['number', 42],
    ['object', {}],
    ['array', ['text']],
  ])('rejects %s content before post or comment business logic', async (_label, content) => {
    const post = await sendRequest('', { scope: 'GLOBAL', content });
    const comment = await sendRequest(`/${postId}/comments`, { content });
    expect(post.status).toBe(400);
    expect(comment.status).toBe(400);
    expect(posts.create).not.toHaveBeenCalled();
    expect(posts.comment).not.toHaveBeenCalled();
  });

  it('rejects content exceeding the trimmed length limits', async () => {
    expect((await sendRequest('', { scope: 'GLOBAL', content: 'a'.repeat(10_001) })).status).toBe(
      400,
    );
    expect((await sendRequest(`/${postId}/comments`, { content: 'a'.repeat(5_001) })).status).toBe(
      400,
    );
    expect(posts.create).not.toHaveBeenCalled();
    expect(posts.comment).not.toHaveBeenCalled();
  });

  it.each<Record<string, unknown>>([
    { scope: 'GLOBAL' },
    { scope: 'PROBLEM', problemId: targetId },
    { scope: 'COURSE', courseId: targetId },
  ])('accepts a valid target and trims content for $scope', async (target) => {
    const response = await sendRequest('', { ...target, content: '  hello \n' });
    expect(response.status).toBe(201);
    expect(posts.create).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ ...target, content: 'hello' }),
    );
  });

  it.each<[string, Record<string, unknown>]>([
    ['GLOBAL with problem', { scope: 'GLOBAL', problemId: targetId }],
    ['GLOBAL with course', { scope: 'GLOBAL', courseId: targetId }],
    ['GLOBAL with null target', { scope: 'GLOBAL', problemId: null }],
    ['PROBLEM missing target', { scope: 'PROBLEM' }],
    ['COURSE missing target', { scope: 'COURSE' }],
    ['PROBLEM with wrong target', { scope: 'PROBLEM', courseId: targetId }],
    ['COURSE with wrong target', { scope: 'COURSE', problemId: targetId }],
    ['PROBLEM with both targets', { scope: 'PROBLEM', problemId: targetId, courseId: targetId }],
    ['COURSE with both targets', { scope: 'COURSE', problemId: targetId, courseId: targetId }],
    ['PROBLEM invalid UUID', { scope: 'PROBLEM', problemId: 'bad' }],
    ['COURSE invalid UUID', { scope: 'COURSE', courseId: 'bad' }],
    ['PROBLEM null UUID', { scope: 'PROBLEM', problemId: null }],
    ['COURSE numeric UUID', { scope: 'COURSE', courseId: 5 }],
    ['unknown scope', { scope: 'OTHER' }],
  ])('rejects %s without creating a post', async (_label, target) => {
    const response = await sendRequest('', { ...target, content: 'hello' });
    expect(response.status).toBe(400);
    expect(posts.create).not.toHaveBeenCalled();
  });

  it.each(['bad', '123', '11111111-1111-1111-1111-invalid'])(
    'rejects malformed route UUID %s',
    async (id) => {
      expect((await sendRequest(`/${id}/comments`, { content: 'hello' })).status).toBe(400);
      expect((await sendRequest(`/${id}/reactions/like`, {}, 'PUT')).status).toBe(400);
      expect(posts.comment).not.toHaveBeenCalled();
      expect(posts.setPostLike).not.toHaveBeenCalled();
    },
  );

  it('accepts UUID routes and content exactly at the trimmed limits', async () => {
    expect(
      (await sendRequest('', { scope: 'GLOBAL', content: `  ${'a'.repeat(10_000)}  ` })).status,
    ).toBe(201);
    expect(posts.create).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ content: 'a'.repeat(10_000) }),
    );
    expect(
      (
        await sendRequest(`/${postId}/comments`, {
          content: `  ${'b'.repeat(5_000)}  `,
          parentCommentId: targetId,
        })
      ).status,
    ).toBe(201);
    expect(posts.comment).toHaveBeenCalledWith(
      userId,
      postId,
      expect.objectContaining({ content: 'b'.repeat(5_000), parentCommentId: targetId }),
    );
    expect((await sendRequest(`/${postId}/reactions/like`, {}, 'PUT')).status).toBe(200);
    expect(posts.setPostLike).toHaveBeenCalledWith(userId, postId, true);
  });

  it('preserves rejection of invalid parent IDs and client-owned author fields', async () => {
    expect(
      (await sendRequest(`/${postId}/comments`, { content: 'hello', parentCommentId: 'bad' }))
        .status,
    ).toBe(400);
    expect(
      (await sendRequest('', { scope: 'GLOBAL', content: 'hello', authorId: targetId })).status,
    ).toBe(400);
    expect(posts.create).not.toHaveBeenCalled();
    expect(posts.comment).not.toHaveBeenCalled();
  });
});
