import { AllExceptionsFilter, createValidationPipe } from '@app/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import type { EntityManager, Repository } from 'typeorm';

import { TrustedUserGuard } from '@/common/auth';
import { EditContent } from '@/modules/posts/application';
import { Comment, Post, Reaction } from '@/modules/posts/entities';
import { PostsController } from '@/modules/posts/posts.controller';
import { PostsService } from '@/modules/posts/posts.service';

const ownerId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const postId = '33333333-3333-4333-8333-333333333333';
const parentId = '44444444-4444-4444-8444-444444444444';
const credential = 'test-community-secret-32-characters';

interface InsertBuilder {
  insert(): InsertBuilder;
  into(entity: typeof Reaction): InsertBuilder;
  values(value: { userId: string }): InsertBuilder;
  orIgnore(): InsertBuilder;
  execute(): Promise<void>;
}

function createFixture() {
  const likes = new Set<string>();
  const post = { id: postId, authorId: ownerId, isHidden: false };
  const posts = { findOne: jest.fn().mockResolvedValue(post) };
  const comments = {
    findOne: jest.fn(),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(async (value: unknown) => value),
  };
  const insert = jest.fn();
  const reactions = {
    createQueryBuilder: jest.fn(() => {
      let actor = '';
      const builder: InsertBuilder = {
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn((value: { userId: string }) => {
          actor = value.userId;
          return builder;
        }),
        orIgnore: jest.fn().mockReturnThis(),
        execute: jest.fn(async () => {
          insert(actor);
          likes.add(actor);
        }),
      };
      return builder;
    }),
    delete: jest.fn(async (where: { userId: string }) => {
      likes.delete(where.userId);
    }),
    countBy: jest.fn(async () => likes.size),
  };
  const manager = {
    getRepository: jest.fn((entity: typeof Post | typeof Comment | typeof Reaction) =>
      entity === Post ? posts : entity === Comment ? comments : reactions,
    ),
  } as unknown as EntityManager;
  const transaction = jest.fn(async (work: (tx: EntityManager) => Promise<unknown>) =>
    work(manager),
  );
  const service = new PostsService(
    { ...posts, manager: { transaction } } as unknown as Repository<Post>,
    comments as unknown as Repository<Comment>,
    { ...reactions, manager: { transaction } } as unknown as Repository<Reaction>,
  );
  return { service, likes, post, posts, comments, reactions, insert, transaction };
}

describe('Community interaction policies', () => {
  it('keeps repeated likes on and repeated unlikes off without affecting another user', async () => {
    const f = createFixture();
    f.likes.add(ownerId);
    expect(await f.service.setPostLike(userId, postId, true)).toEqual({
      liked: true,
      likeCount: 2,
    });
    expect(await f.service.setPostLike(userId, postId, true)).toEqual({
      liked: true,
      likeCount: 2,
    });
    expect(await f.service.setPostLike(userId, postId, false)).toEqual({
      liked: false,
      likeCount: 1,
    });
    expect(await f.service.setPostLike(userId, postId, false)).toEqual({
      liked: false,
      likeCount: 1,
    });
    expect(f.likes).toEqual(new Set([ownerId]));
    expect(f.reactions.delete).toHaveBeenCalledWith({ post: { id: postId }, userId });
    expect(f.transaction).toHaveBeenCalledTimes(4);
  });

  it.each([true, false])(
    'rejects missing posts before reading or writing reactions (%s)',
    async (liked) => {
      const f = createFixture();
      f.posts.findOne.mockResolvedValue(null);
      await expect(f.service.setPostLike(userId, postId, liked)).rejects.toMatchObject({
        code: 'POST_NOT_FOUND',
      });
      expect(f.reactions.createQueryBuilder).not.toHaveBeenCalled();
      expect(f.reactions.delete).not.toHaveBeenCalled();
      expect(f.reactions.countBy).not.toHaveBeenCalled();
    },
  );

  it.each([true, false])(
    'conceals hidden posts from nonauthors including existing likes (%s)',
    async (liked) => {
      const f = createFixture();
      f.post.isHidden = true;
      f.likes.add(userId);
      await expect(f.service.setPostLike(userId, postId, liked)).rejects.toMatchObject({
        code: 'POST_NOT_FOUND',
      });
      expect(f.likes.has(userId)).toBe(true);
      expect(f.reactions.countBy).not.toHaveBeenCalled();
      expect(f.reactions.delete).not.toHaveBeenCalled();
      expect(f.reactions.createQueryBuilder).not.toHaveBeenCalled();
    },
  );

  it('rejects author likes on a hidden post but allows idempotent unlike', async () => {
    const f = createFixture();
    f.post.isHidden = true;
    f.likes.add(ownerId);
    await expect(f.service.setPostLike(ownerId, postId, true)).rejects.toMatchObject({
      code: 'POST_INTERACTION_DISABLED',
    });
    expect(f.likes.has(ownerId)).toBe(true);
    expect(await f.service.setPostLike(ownerId, postId, false)).toEqual({
      liked: false,
      likeCount: 0,
    });
    expect(await f.service.setPostLike(ownerId, postId, false)).toEqual({
      liked: false,
      likeCount: 0,
    });
  });

  it('keeps likes stored across hiding and permits interactions again after restoration', async () => {
    const f = createFixture();
    await f.service.setPostLike(userId, postId, true);
    f.post.isHidden = true;
    await expect(f.service.setPostLike(userId, postId, true)).rejects.toMatchObject({
      code: 'POST_NOT_FOUND',
    });
    f.post.isHidden = false;
    expect(await f.service.setPostLike(userId, postId, true)).toEqual({
      liked: true,
      likeCount: 1,
    });
  });

  it.each([ownerId, userId])('rejects new comments on hidden posts for %s', async (authorId) => {
    const f = createFixture();
    f.post.isHidden = true;
    await expect(f.service.comment(authorId, postId, { content: 'hello' })).rejects.toMatchObject({
      code: authorId === ownerId ? 'POST_INTERACTION_DISABLED' : 'POST_NOT_FOUND',
    });
    expect(f.comments.save).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', null],
    ['other post', { post: { id: 'other' }, isHidden: false, parentComment: null }],
    ['hidden', { post: { id: postId }, isHidden: true, parentComment: null }],
  ])('rejects a %s parent comment without saving', async (_label, parent) => {
    const f = createFixture();
    f.comments.findOne.mockResolvedValue(parent);
    await expect(
      f.service.comment(userId, postId, { content: 'hello', parentCommentId: parentId }),
    ).rejects.toMatchObject({ code: 'COMMENT_PARENT_NOT_FOUND' });
    expect(f.comments.save).not.toHaveBeenCalled();
  });

  it('preserves one reply level and accepts public root replies', async () => {
    const f = createFixture();
    const parent = { post: { id: postId }, isHidden: false, parentComment: { id: parentId } };
    f.comments.findOne.mockResolvedValue(parent);
    await expect(
      f.service.comment(userId, postId, { content: 'hello', parentCommentId: parentId }),
    ).rejects.toMatchObject({ code: 'COMMENT_REPLY_DEPTH_EXCEEDED' });
    f.comments.findOne.mockResolvedValue({ ...parent, parentComment: null });
    await f.service.comment(userId, postId, { content: 'hello', parentCommentId: parentId });
    expect(f.comments.save).toHaveBeenCalledTimes(1);
    expect(f.posts.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_read' } }),
    );
    expect(f.comments.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_read', tables: ['comments'] } }),
    );
  });
});

describe('Explicit post like HTTP contract', () => {
  let app: INestApplication;
  let baseUrl: string;
  let fixture: ReturnType<typeof createFixture>;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PostsController],
      providers: [
        { provide: EditContent, useValue: { execute: jest.fn() } },
        TrustedUserGuard,
        {
          provide: PostsService,
          useFactory: () => ({
            setPostLike: (actor: string, id: string, liked: boolean) =>
              fixture.service.setPostLike(actor, id, liked),
            comment: (
              actor: string,
              id: string,
              dto: { content: string; parentCommentId?: string },
            ) => fixture.service.comment(actor, id, dto),
          }),
        },
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
    fixture = createFixture();
  });

  async function sendLike(
    method: string,
    actor = userId,
    body?: unknown,
    id = postId,
  ): Promise<Response> {
    return fetch(`${baseUrl}/api/community/posts/${id}/reactions/like`, {
      method,
      headers: {
        'x-auth-user-id': actor,
        'x-internal-community-secret': credential,
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  it('returns 200 and stable state/count on PUT/DELETE retries', async () => {
    for (const method of ['PUT', 'PUT', 'DELETE', 'DELETE']) {
      const response = await sendLike(method);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        liked: method === 'PUT',
        likeCount: method === 'PUT' ? 1 : 0,
      });
    }
    expect((await sendLike('POST')).status).toBe(404);
  });

  it.each(['PUT', 'DELETE'])('rejects client-owned fields and bad UUIDs for %s', async (method) => {
    for (const body of [{ userId: ownerId }, { type: 'LIKE' }, { likeCount: 7 }]) {
      expect((await sendLike(method, userId, body)).status).toBe(400);
    }
    expect((await sendLike(method, userId, {}, 'bad')).status).toBe(400);
    expect(fixture.transaction).not.toHaveBeenCalled();
  });

  it('returns 404 without counts to nonauthors and 409 for author likes on hidden posts', async () => {
    fixture.post.isHidden = true;
    fixture.likes.add(ownerId);
    for (const method of ['PUT', 'DELETE']) {
      const response = await sendLike(method);
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain('likeCount');
    }
    expect((await sendLike('PUT', ownerId)).status).toBe(409);
    const removed = await sendLike('DELETE', ownerId);
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ liked: false, likeCount: 0 });
  });
});

class MetadataDataSource extends DataSource {
  async prepareMetadata(): Promise<void> {
    await this.buildMetadatas();
  }
}

describe('PostgreSQL reaction statements', () => {
  it('uses conflict-safe insert and locks only the parent comment table in joined reads', async () => {
    const source = new MetadataDataSource({
      type: 'postgres',
      entities: [Post, Comment, Reaction],
    });
    await source.prepareMetadata();
    const sql = source
      .getRepository(Reaction)
      .createQueryBuilder()
      .insert()
      .into(Reaction)
      .values({ post: { id: postId }, userId })
      .orIgnore()
      .getSql();
    expect(sql).toContain('ON CONFLICT DO NOTHING');
    const parentSql = source
      .getRepository(Comment)
      .createQueryBuilder('parent')
      .setFindOptions({
        where: { id: parentId },
        relations: { post: true, parentComment: true },
        lock: { mode: 'pessimistic_read', tables: ['comments'] },
      })
      .getSql();
    expect(parentSql).toContain('FOR SHARE OF "parent"');
  });
});
