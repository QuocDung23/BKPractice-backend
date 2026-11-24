import { randomUUID } from 'node:crypto';

import { AllExceptionsFilter, createValidationPipe } from '@app/common';
import { InitialCommunitySchema1700000002000 } from '@community/database/migrations/1700000002000-InitialCommunitySchema';
import { CommunityContentLifecycle1795527000000 } from '@community/database/migrations/1795527000000-CommunityContentLifecycle';
import { communityEntities } from '@community/modules/community.entities';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { Comment, Post, PostScope, Reaction } from '@/modules/posts/entities';
import { PostsModule } from '@/modules/posts/posts.module';

const testUrl = process.env.COMMUNITY_TEST_DATABASE_URL;
const databaseTests = testUrl ? describe : describe.skip;
const ownerId = randomUUID();
const actorId = randomUUID();
const credential = 'isolated-community-test-credential-32-characters';

databaseTests('Community real PostgreSQL and HTTP', () => {
  let app: INestApplication;
  let source: DataSource;
  let baseUrl: string;
  let postId: string;
  jest.setTimeout(30000);

  beforeAll(async () => {
    if (!testUrl) throw new Error('Dedicated test database URL required');
    const url = new URL(testUrl);
    const suffix = /^\/bkpractice_community_test_([a-f0-9]{12})$/.exec(url.pathname)?.[1];
    if (!suffix || url.username !== `community_test_${suffix}`)
      throw new Error('Refusing a non-isolated database');
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ COMMUNITY_GATEWAY_SECRET: credential })],
        }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: testUrl,
          entities: communityEntities,
          migrations: [InitialCommunitySchema1700000002000, CommunityContentLifecycle1795527000000],
          migrationsRun: true,
          synchronize: false,
          extra: { max: 25, application_name: 'community-real-postgres-test' },
        }),
        PostsModule,
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    source = app.get(DataSource);
  });

  afterAll(async () => {
    if (app) await app.close();
  });
  beforeEach(async () => {
    await source.query('TRUNCATE TABLE posts CASCADE');
    const post = await source
      .getRepository(Post)
      .save({ authorId: ownerId, scope: PostScope.Global, content: 'Isolated real database test' });
    postId = post.id;
  });

  async function sendRequest(
    method: string,
    path: string,
    actor = actorId,
    body?: unknown,
  ): Promise<Response> {
    return fetch(`${baseUrl}/api/community/posts/${postId}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-auth-user-id': actor,
        'x-internal-community-secret': credential,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async function waitForDatabaseLock(): Promise<void> {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const waiting: { count: number }[] = await source.query(
        "SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND application_name = 'community-real-postgres-test'",
      );
      if ((waiting[0]?.count ?? 0) > 0) return;
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('Interaction never reached the expected PostgreSQL row lock');
  }

  async function readReplies(rootId: string, query = '', actor = actorId): Promise<Response> {
    return fetch(`${baseUrl}/api/community/comments/${rootId}/replies${query}`, {
      headers: { 'x-auth-user-id': actor, 'x-internal-community-secret': credential },
    });
  }

  it('paginates replies of only the selected root with stable totals', async () => {
    const root = await source
      .getRepository(Comment)
      .save({ post: { id: postId }, authorId: ownerId, content: 'root' });
    const otherRoot = await source
      .getRepository(Comment)
      .save({ post: { id: postId }, authorId: ownerId, content: 'other root' });
    const replies = await source.getRepository(Comment).save(
      Array.from({ length: 25 }, (_, index) => ({
        post: { id: postId },
        parentComment: { id: root.id },
        authorId: actorId,
        content: `Reply ${index}`,
        createdAt: new Date(1700000000000 + index * 1000),
      })),
    );
    await source.getRepository(Comment).save({
      post: { id: postId },
      parentComment: { id: otherRoot.id },
      authorId: actorId,
      content: 'wrong root reply',
    });
    const first = await readReplies(root.id);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({
      page: 1,
      pageSize: 20,
      total: 25,
      items: replies.slice(0, 20).map((reply) => ({
        id: reply.id,
        postId,
        parentCommentId: root.id,
        moderation: { status: 'VISIBLE' },
      })),
    });
    expect(await (await readReplies(root.id, '?page=3&pageSize=10')).json()).toMatchObject({
      page: 3,
      pageSize: 10,
      total: 25,
      items: replies.slice(20).map((reply) => ({ id: reply.id })),
    });
    expect(await (await readReplies(root.id, '?page=99')).json()).toEqual({
      items: [],
      page: 99,
      pageSize: 20,
      total: 25,
    });
    expect((await readReplies(replies[0]!.id)).status).toBe(404);
  });

  it('supports empty reply pages and deterministic timestamp ties', async () => {
    const root = await source
      .getRepository(Comment)
      .save({ post: { id: postId }, authorId: ownerId, content: 'root' });
    expect(await (await readReplies(root.id)).json()).toEqual({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });
    const ids = [randomUUID(), randomUUID()].sort();
    await source.getRepository(Comment).save(
      ids
        .slice()
        .reverse()
        .map((id) => ({
          id,
          post: { id: postId },
          parentComment: { id: root.id },
          authorId: ownerId,
          content: 'same time',
          createdAt: new Date(1700000000000),
        })),
    );
    const body: unknown = await (await readReplies(root.id, '?pageSize=50')).json();
    expect(body).toMatchObject({ total: 2, pageSize: 50, items: ids.map((id) => ({ id })) });
    expect(JSON.stringify(body)).not.toContain('replyCount');
    expect(JSON.stringify(body)).not.toContain('moderation');
    expect(JSON.stringify(body)).not.toContain('"post":');
  });

  it('reveals hidden replies only to their author, not to the root author', async () => {
    const root = await source
      .getRepository(Comment)
      .save({ post: { id: postId }, authorId: ownerId, content: 'root' });
    const visible = await source.getRepository(Comment).save({
      post: { id: postId },
      parentComment: { id: root.id },
      authorId: actorId,
      content: 'visible',
      createdAt: new Date(1700000000000),
    });
    const actorHidden = await source.getRepository(Comment).save({
      post: { id: postId },
      parentComment: { id: root.id },
      authorId: actorId,
      content: 'actor secret',
      isHidden: true,
      createdAt: new Date(1700000001000),
    });
    const ownerHidden = await source.getRepository(Comment).save({
      post: { id: postId },
      parentComment: { id: root.id },
      authorId: ownerId,
      content: 'owner secret',
      isHidden: true,
      createdAt: new Date(1700000002000),
    });
    const actorBody: unknown = await (await readReplies(root.id)).json();
    expect(actorBody).toMatchObject({
      total: 2,
      items: [
        { id: visible.id, moderation: { status: 'VISIBLE' } },
        { id: actorHidden.id, moderation: { status: 'HIDDEN' } },
      ],
    });
    expect(JSON.stringify(actorBody)).not.toContain('owner secret');
    const ownerBody: unknown = await (await readReplies(root.id, '', ownerId)).json();
    expect(ownerBody).toMatchObject({
      total: 2,
      items: [{ id: visible.id }, { id: ownerHidden.id, moderation: { status: 'HIDDEN' } }],
    });
    expect(JSON.stringify(ownerBody)).not.toContain('actor secret');
    expect(await (await readReplies(root.id, '', randomUUID())).json()).toMatchObject({
      total: 1,
      items: [{ id: visible.id }],
    });
    await source.getRepository(Comment).update(root.id, { isHidden: true });
    expect((await readReplies(root.id)).status).toBe(404);
    expect((await readReplies(root.id, '', ownerId)).status).toBe(200);
  });

  it('does not bypass hidden Post/root visibility for either resource author', async () => {
    const root = await source
      .getRepository(Comment)
      .save({ post: { id: postId }, authorId: actorId, content: 'root' });
    await source.getRepository(Post).update(postId, { isHidden: true });
    expect((await readReplies(root.id)).status).toBe(404);
    expect((await readReplies(root.id, '', ownerId)).status).toBe(200);
    await source.getRepository(Comment).update(root.id, { isHidden: true });
    for (const actor of [actorId, ownerId]) {
      const response = await readReplies(root.id, '', actor);
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain('total');
    }
    await source.getRepository(Post).update(postId, { isHidden: false });
    expect((await readReplies(root.id)).status).toBe(200);
    expect((await readReplies(root.id, '', ownerId)).status).toBe(404);
  });

  it.each([
    '?page=0',
    '?page=-1',
    '?page=1.5',
    '?page=abc',
    '?page=1e100',
    '?page=Infinity',
    '?pageSize=0',
    '?pageSize=51',
    '?pageSize=2.5',
    '?authorId=someone',
  ])('rejects invalid reply query %s', async (query) => {
    expect((await readReplies(randomUUID(), query)).status).toBe(400);
  });

  it('requires trusted authentication, UUIDs and an existing root for reply reads', async () => {
    expect((await readReplies('bad')).status).toBe(400);
    expect((await readReplies(randomUUID())).status).toBe(404);
    expect((await fetch(`${baseUrl}/api/community/comments/${randomUUID()}/replies`)).status).toBe(
      401,
    );
    expect(
      (
        await fetch(`${baseUrl}/api/community/comments/${randomUUID()}/replies`, {
          headers: { 'x-auth-user-id': actorId },
        })
      ).status,
    ).toBe(401);
  });

  async function readComments(query = '', actor = actorId, id = postId): Promise<Response> {
    return fetch(`${baseUrl}/api/community/posts/${id}/comments${query}`, {
      headers: { 'x-auth-user-id': actor, 'x-internal-community-secret': credential },
    });
  }

  it('paginates roots oldest first with stable totals, defaults and out-of-range pages', async () => {
    const roots = await source.getRepository(Comment).save(
      Array.from({ length: 25 }, (_, index) => ({
        post: { id: postId },
        authorId: ownerId,
        content: `Root ${index}`,
        createdAt: new Date(1700000000000 + index * 1000),
      })),
    );
    await source.getRepository(Comment).save({
      post: { id: postId },
      authorId: actorId,
      content: 'Reply',
      parentComment: { id: roots[0]!.id },
    });
    const response = await readComments();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      page: 1,
      pageSize: 20,
      total: 25,
      items: roots.slice(0, 20).map((root, index) => ({
        id: root.id,
        postId,
        parentCommentId: null,
        replyCount: index === 0 ? 1 : 0,
      })),
    });
    expect(await (await readComments('?page=2&pageSize=10')).json()).toMatchObject({
      page: 2,
      pageSize: 10,
      total: 25,
      items: roots.slice(10, 20).map((root) => ({ id: root.id, replyCount: 0 })),
    });
    expect(await (await readComments('?page=99&pageSize=10')).json()).toEqual({
      items: [],
      page: 99,
      pageSize: 10,
      total: 25,
    });
  });

  it('returns empty pages, allows size 50 and breaks timestamp ties by UUID', async () => {
    expect(await (await readComments()).json()).toEqual({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });
    const ids = [randomUUID(), randomUUID()].sort();
    await source.getRepository(Comment).save(
      ids
        .slice()
        .reverse()
        .map((id) => ({
          id,
          post: { id: postId },
          authorId: actorId,
          content: 'Same timestamp',
          createdAt: new Date(1700000000000),
        })),
    );
    expect(await (await readComments('?pageSize=50')).json()).toMatchObject({
      pageSize: 50,
      total: 2,
      items: ids.map((id) => ({ id, moderation: { status: 'VISIBLE' } })),
    });
  });

  it('filters hidden roots and counts only visible replies for the caller', async () => {
    const publicRoot = await source.getRepository(Comment).save({
      post: { id: postId },
      authorId: ownerId,
      content: 'public-root',
      createdAt: new Date(1700000000000),
    });
    const hiddenRoot = await source.getRepository(Comment).save({
      post: { id: postId },
      authorId: ownerId,
      content: 'secret-root',
      isHidden: true,
      createdAt: new Date(1700000001000),
    });
    await source.getRepository(Comment).save([
      {
        post: { id: postId },
        parentComment: { id: publicRoot.id },
        authorId: actorId,
        content: 'public-reply',
      },
      {
        post: { id: postId },
        parentComment: { id: publicRoot.id },
        authorId: ownerId,
        content: 'secret-reply',
        isHidden: true,
      },
      {
        post: { id: postId },
        parentComment: { id: hiddenRoot.id },
        authorId: actorId,
        content: 'reply-under-hidden-root',
      },
    ]);
    const viewer: unknown = await (await readComments()).json();
    expect(viewer).toMatchObject({ total: 1, items: [{ id: publicRoot.id, replyCount: 1 }] });
    expect(JSON.stringify(viewer)).not.toContain('secret-root');
    expect(JSON.stringify(viewer)).not.toContain('secret-reply');
    expect(JSON.stringify(viewer)).not.toContain('moderation');
    expect(await (await readComments('', ownerId)).json()).toMatchObject({
      total: 2,
      items: [
        { id: publicRoot.id, replyCount: 2, moderation: { status: 'VISIBLE' } },
        { id: hiddenRoot.id, replyCount: 1, moderation: { status: 'HIDDEN' } },
      ],
    });
  });

  it('restricts a hidden Post stream to its author and isolates other Post comments', async () => {
    const root = await source
      .getRepository(Comment)
      .save({ post: { id: postId }, authorId: actorId, content: 'Visible root' });
    const otherPost = await source
      .getRepository(Post)
      .save({ authorId: ownerId, scope: PostScope.Global, content: 'Other Post' });
    await source
      .getRepository(Comment)
      .save({ post: { id: otherPost.id }, authorId: actorId, content: 'Other root' });
    expect(await (await readComments()).json()).toMatchObject({
      total: 1,
      items: [{ id: root.id }],
    });
    await source.getRepository(Post).update(postId, { isHidden: true });
    expect((await readComments()).status).toBe(404);
    expect(await (await readComments('', ownerId)).json()).toMatchObject({
      total: 1,
      items: [{ id: root.id }],
    });
    expect((await readComments('', actorId, randomUUID())).status).toBe(404);
  });

  it.each([
    '?page=0',
    '?page=-1',
    '?page=1.5',
    '?page=abc',
    '?page=1e100',
    '?page=Infinity',
    '?pageSize=0',
    '?pageSize=51',
    '?pageSize=2.5',
    '?authorId=someone',
  ])('rejects invalid comment query %s', async (query) => {
    expect((await readComments(query)).status).toBe(400);
  });

  it('requires trusted authentication and a UUID for comment reads', async () => {
    expect((await readComments('', actorId, 'bad')).status).toBe(400);
    expect((await fetch(`${baseUrl}/api/community/posts/${postId}/comments`)).status).toBe(401);
  });

  async function readFeed(actor = actorId): Promise<Response> {
    return fetch(`${baseUrl}/api/community/posts`, {
      headers: { 'x-auth-user-id': actor, 'x-internal-community-secret': credential },
    });
  }

  it('returns batched counts and caller-specific flags for multiple posts without leaking reactors', async () => {
    const otherPost = await source
      .getRepository(Post)
      .save({ authorId: ownerId, scope: PostScope.Global, content: 'Another post' });
    const emptyPost = await source
      .getRepository(Post)
      .save({ authorId: ownerId, scope: PostScope.Global, content: 'No likes' });
    await source.getRepository(Reaction).save([
      { post: { id: postId }, userId: actorId },
      { post: { id: postId }, userId: ownerId },
      { post: { id: otherPost.id }, userId: ownerId },
    ]);
    const viewerResponse = await readFeed();
    expect(viewerResponse.status).toBe(200);
    const viewerFeed: unknown = ((await viewerResponse.json()) as { items: unknown }).items;
    expect(viewerFeed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: postId, likeCount: 2, likedByMe: true }),
        expect.objectContaining({ id: otherPost.id, likeCount: 1, likedByMe: false }),
        expect.objectContaining({ id: emptyPost.id, likeCount: 0, likedByMe: false }),
      ]),
    );
    const ownerResponse = await readFeed(ownerId);
    expect(((await ownerResponse.json()) as { items: unknown }).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: otherPost.id, likeCount: 1, likedByMe: true }),
      ]),
    );
    expect(JSON.stringify(viewerFeed)).not.toContain('userId');
    expect(JSON.stringify(viewerFeed)).not.toContain('reactions');
  });

  it('reflects unlike after reloading and excludes hidden posts and their counts', async () => {
    await sendRequest('PUT', '/reactions/like');
    expect(((await (await readFeed()).json()) as { items: unknown }).items).toEqual([
      expect.objectContaining({ id: postId, likeCount: 1, likedByMe: true }),
    ]);
    await sendRequest('DELETE', '/reactions/like');
    expect(((await (await readFeed()).json()) as { items: unknown }).items).toEqual([
      expect.objectContaining({ id: postId, likeCount: 0, likedByMe: false }),
    ]);
    await source.getRepository(Post).update(postId, { isHidden: true });
    expect(((await (await readFeed()).json()) as { items: unknown }).items).toEqual([]);
    expect(((await (await readFeed(ownerId)).json()) as { items: unknown }).items).toEqual([]);
  });

  it('pages newest first without pinned priority and only aggregates returned post IDs', async () => {
    await source.getRepository(Post).save(
      Array.from({ length: 51 }, (_, index) => ({
        authorId: ownerId,
        scope: PostScope.Global,
        content: `Feed ${index}`,
        isPinned: index === 0,
        createdAt: new Date(1700000000000 + index * 1000),
      })),
    );
    const response = await readFeed();
    const feed: unknown = ((await response.json()) as { items: unknown }).items;
    expect(Array.isArray(feed)).toBe(true);
    if (!Array.isArray(feed)) throw new Error('Expected array feed');
    expect(feed).toHaveLength(20);
    expect(feed[0]).toMatchObject({
      id: postId,
      likeCount: 0,
      likedByMe: false,
    });
  });

  async function callApi(
    method: string,
    path: string,
    actor = ownerId,
    body?: unknown,
  ): Promise<Response> {
    return fetch(`${baseUrl}/api/community/${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-auth-user-id': actor,
        'x-internal-community-secret': credential,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  it('reads post detail with viewer reactions and author-only moderation', async () => {
    await sendRequest('PUT', '/reactions/like');
    const response = await callApi('GET', `posts/${postId}`, actorId);
    expect(response.status).toBe(200);
    const detail: unknown = await response.json();
    expect(detail).toMatchObject({ id: postId, likeCount: 1, likedByMe: true, editedAt: null });
    expect(detail).not.toHaveProperty('moderation');
    expect(detail).not.toHaveProperty('deletedAt');
    await source.getRepository(Post).update(postId, { isHidden: true });
    expect((await callApi('GET', `posts/${postId}`, actorId)).status).toBe(404);
    expect(await (await callApi('GET', `posts/${postId}`)).json()).toMatchObject({
      moderation: { status: 'HIDDEN' },
    });
    expect((await callApi('GET', `posts/${randomUUID()}`)).status).toBe(404);
    expect((await callApi('GET', 'posts/not-a-uuid')).status).toBe(400);
  });

  it('filters and pages posts with stable ordering, visible totals and empty out-of-range pages', async () => {
    const problemId = randomUUID();
    const courseId = randomUUID();
    const ids = [randomUUID(), randomUUID(), randomUUID()].sort().reverse();
    await source.getRepository(Post).save(
      ids.map((id) => ({
        id,
        authorId: ownerId,
        content: 'Problem post',
        scope: PostScope.Problem,
        problemId,
        createdAt: new Date(1700000000000),
      })),
    );
    await source
      .getRepository(Post)
      .save({ authorId: ownerId, content: 'Course post', scope: PostScope.Course, courseId });
    await source.getRepository(Post).save({
      authorId: ownerId,
      content: 'Hidden',
      scope: PostScope.Problem,
      problemId,
      isHidden: true,
    });
    await source.getRepository(Post).save({
      authorId: ownerId,
      content: 'Deleted',
      scope: PostScope.Problem,
      problemId,
      deletedAt: new Date(),
    });
    expect(
      await (await callApi('GET', `posts?scope=PROBLEM&problemId=${problemId}&pageSize=2`)).json(),
    ).toMatchObject({
      total: 3,
      page: 1,
      pageSize: 2,
      items: ids.slice(0, 2).map((id) => ({ id })),
    });
    expect(
      await (await callApi('GET', `posts?problemId=${problemId}&pageSize=2&page=2`)).json(),
    ).toMatchObject({ total: 3, items: [{ id: ids[2] }] });
    expect(await (await callApi('GET', `posts?courseId=${courseId}`)).json()).toMatchObject({
      total: 1,
      items: [{ courseId }],
    });
    expect(await (await callApi('GET', 'posts?page=99')).json()).toEqual({
      total: 5,
      page: 99,
      pageSize: 20,
      items: [],
    });
  });

  it.each([
    '?page=0',
    '?pageSize=51',
    '?page=Infinity',
    '?page=2.5',
    '?scope=OTHER',
    '?problemId=bad',
    '?scope=GLOBAL&problemId=11111111-1111-4111-8111-111111111111',
    '?authorId=someone',
    '?courseId=11111111-1111-4111-8111-111111111111&problemId=11111111-1111-4111-8111-111111111111',
  ])('rejects invalid post page or filter %s', async (query) => {
    expect((await callApi('GET', `posts${query}`)).status).toBe(400);
  });

  it('edits only owned posts and preserves hidden state', async () => {
    expect(
      (await callApi('PATCH', `posts/${postId}`, actorId, { content: 'forbidden' })).status,
    ).toBe(403);
    const edited = await callApi('PATCH', `posts/${postId}`, ownerId, { content: '  updated  ' });
    expect(edited.status).toBe(200);
    expect(await edited.json()).toMatchObject({
      content: 'updated',
      editedAt: expect.any(String) as unknown,
    });
    await source.getRepository(Post).update(postId, { isHidden: true });
    expect(
      (await callApi('PATCH', `posts/${postId}`, actorId, { content: 'concealed' })).status,
    ).toBe(404);
    expect(
      (await callApi('PATCH', `posts/${postId}`, ownerId, { content: 'edited while hidden' }))
        .status,
    ).toBe(200);
    expect(await source.getRepository(Post).findOneByOrFail({ id: postId })).toMatchObject({
      isHidden: true,
      content: 'edited while hidden',
    });
  });

  it.each([
    {},
    { content: null },
    { content: '  ' },
    { content: 'a'.repeat(10001) },
    { content: '<script>alert(1)</script>' },
    { content: '[bad](javascript:alert)' },
    { content: 'new', authorId: actorId },
    { content: 'new', scope: 'GLOBAL' },
  ])('rejects invalid post edits without changing data', async (body) => {
    expect((await callApi('PATCH', `posts/${postId}`, ownerId, body)).status).toBe(400);
    expect(await source.getRepository(Post).findOneByOrFail({ id: postId })).toMatchObject({
      content: 'Isolated real database test',
      editedAt: null,
    });
  });

  it('accepts code-fenced and inline code in edited Markdown', async () => {
    for (const content of [
      'Code: `<script>`',
      '```cpp\n#include <stdio.h>\n```',
      '~~~html\n<script>\n~~~',
    ]) {
      expect((await callApi('PATCH', `posts/${postId}`, ownerId, { content })).status).toBe(200);
    }
  });

  it('soft deletes a post, retains its children and likes, conceals reads and blocks every interaction', async () => {
    const root = await source
      .getRepository(Comment)
      .save({ post: { id: postId }, authorId: actorId, content: 'root' });
    await sendRequest('PUT', '/reactions/like');
    expect((await callApi('DELETE', `posts/${postId}`, actorId)).status).toBe(403);
    expect((await callApi('DELETE', `posts/${postId}`)).status).toBe(204);
    const saved = await source.getRepository(Post).findOneByOrFail({ id: postId });
    expect(saved.deletedAt).toBeInstanceOf(Date);
    expect(await source.getRepository(Comment).count()).toBe(1);
    expect(await source.getRepository(Reaction).count()).toBe(1);
    for (const actor of [actorId, ownerId]) {
      expect((await callApi('GET', `posts/${postId}`, actor)).status).toBe(404);
      expect((await callApi('GET', `posts/${postId}/comments`, actor)).status).toBe(404);
      expect((await readReplies(root.id, '', actor)).status).toBe(404);
      expect((await sendRequest('PUT', '/reactions/like', actor)).status).toBe(404);
      expect((await sendRequest('POST', '/comments', actor, { content: 'denied' })).status).toBe(
        404,
      );
    }
    expect((await callApi('DELETE', `posts/${postId}`)).status).toBe(409);
    expect((await callApi('PATCH', `posts/${postId}`, ownerId, { content: 'denied' })).status).toBe(
      409,
    );
    expect((await callApi('DELETE', `posts/${postId}`, actorId)).status).toBe(404);
    expect(await (await callApi('GET', 'posts')).json()).toMatchObject({ items: [], total: 0 });
  });

  it('edits/deletes only owned comments and hides replies when their root is deleted', async () => {
    const root = await source
      .getRepository(Comment)
      .save({ post: { id: postId }, authorId: ownerId, content: 'root' });
    const reply = await source.getRepository(Comment).save({
      post: { id: postId },
      parentComment: { id: root.id },
      authorId: actorId,
      content: 'reply',
    });
    expect(
      (await callApi('PATCH', `comments/${reply.id}`, ownerId, { content: 'not mine' })).status,
    ).toBe(403);
    expect((await callApi('DELETE', `comments/${reply.id}`, ownerId)).status).toBe(403);
    expect(
      (await callApi('PATCH', `comments/${reply.id}`, actorId, { content: 'updated reply' }))
        .status,
    ).toBe(200);
    expect(await source.getRepository(Comment).findOneByOrFail({ id: reply.id })).toMatchObject({
      content: 'updated reply',
      editedAt: expect.any(Date) as unknown,
    });
    expect((await callApi('DELETE', `comments/${root.id}`)).status).toBe(204);
    expect((await readReplies(root.id, '', ownerId)).status).toBe(404);
    expect(
      (await callApi('PATCH', `comments/${reply.id}`, actorId, { content: 'denied' })).status,
    ).toBe(404);
    expect(
      (
        await sendRequest('POST', '/comments', actorId, {
          parentCommentId: root.id,
          content: 'denied',
        })
      ).status,
    ).toBe(404);
    expect(await (await readComments()).json()).toMatchObject({ items: [], total: 0 });
    expect(await source.getRepository(Comment).count()).toBe(2);
    expect((await callApi('DELETE', `comments/${root.id}`)).status).toBe(409);
  });

  it('excludes deleted replies from both list and replyCount', async () => {
    const root = await source
      .getRepository(Comment)
      .save({ post: { id: postId }, authorId: ownerId, content: 'root' });
    const reply = await source.getRepository(Comment).save({
      post: { id: postId },
      parentComment: { id: root.id },
      authorId: actorId,
      content: 'reply',
    });
    expect((await callApi('DELETE', `comments/${reply.id}`, actorId)).status).toBe(204);
    expect(await (await readReplies(root.id)).json()).toMatchObject({ items: [], total: 0 });
    expect(await (await readComments()).json()).toMatchObject({
      items: [{ id: root.id, replyCount: 0 }],
    });
    expect(
      (await callApi('PATCH', `comments/${reply.id}`, actorId, { content: 'denied' })).status,
    ).toBe(409);
  });

  it('rejects oversized comments, immutable fields and delete payload injection', async () => {
    const comment = await source
      .getRepository(Comment)
      .save({ post: { id: postId }, authorId: ownerId, content: 'unchanged' });
    for (const body of [
      { content: 'x'.repeat(5001) },
      { content: 'ok', parentCommentId: randomUUID() },
      { content: '<b>bad</b>' },
      {},
    ]) {
      expect((await callApi('PATCH', `comments/${comment.id}`, ownerId, body)).status).toBe(400);
    }
    expect(
      (await callApi('DELETE', `comments/${comment.id}`, ownerId, { authorId: actorId })).status,
    ).toBe(400);
    expect(
      (await callApi('DELETE', `posts/${postId}`, ownerId, { deletedAt: new Date() })).status,
    ).toBe(400);
    expect(await source.getRepository(Comment).findOneByOrFail({ id: comment.id })).toMatchObject({
      content: 'unchanged',
      deletedAt: null,
    });
  });

  it.each(['PUT', 'POST', 'PATCH'])(
    'a committed soft deletion wins against blocked %s',
    async (method) => {
      const runner = source.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      let pending: Promise<Response> | undefined;
      try {
        await runner.manager.getRepository(Post).update(postId, { deletedAt: new Date() });
        pending = sendRequest(
          method,
          method === 'PUT' ? '/reactions/like' : method === 'POST' ? '/comments' : '',
          ownerId,
          method === 'PUT' ? undefined : { content: 'denied' },
        );
        await waitForDatabaseLock();
        await runner.commitTransaction();
        expect((await pending).status).toBe(method === 'PATCH' ? 409 : 404);
        expect(await source.getRepository(Reaction).count()).toBe(0);
        expect(await source.getRepository(Comment).count()).toBe(0);
      } finally {
        if (runner.isTransactionActive) await runner.rollbackTransaction();
        await runner.release();
        if (pending) await pending;
      }
    },
  );

  it('migration down/up preserves content and backfills nullable lifecycle fields', async () => {
    await source.undoLastMigration();
    try {
      const rows: { content: string }[] = await source.query(
        'SELECT content FROM posts WHERE id = $1',
        [postId],
      );
      expect(rows[0]?.content).toBe('Isolated real database test');
    } finally {
      await source.runMigrations();
    }
    expect(await source.getRepository(Post).findOneByOrFail({ id: postId })).toMatchObject({
      editedAt: null,
      deletedAt: null,
    });
  });

  it('20 concurrent HTTP PUT requests persist exactly one like', async () => {
    const responses = await Promise.all(
      Array.from({ length: 20 }, () => sendRequest('PUT', '/reactions/like')),
    );
    expect(responses.map((response) => response.status)).toEqual(Array(20).fill(200));
    expect(await Promise.all(responses.map((response) => response.json()))).toEqual(
      Array.from({ length: 20 }, () => ({ liked: true, likeCount: 1 })),
    );
    expect(
      await source.getRepository(Reaction).countBy({ post: { id: postId }, userId: actorId }),
    ).toBe(1);
  });

  it('20 concurrent DELETE requests remove only the caller like', async () => {
    expect((await sendRequest('PUT', '/reactions/like', ownerId)).status).toBe(200);
    expect((await sendRequest('PUT', '/reactions/like')).status).toBe(200);
    const responses = await Promise.all(
      Array.from({ length: 20 }, () => sendRequest('DELETE', '/reactions/like')),
    );
    expect(responses.map((response) => response.status)).toEqual(Array(20).fill(200));
    expect(await Promise.all(responses.map((response) => response.json()))).toEqual(
      Array.from({ length: 20 }, () => ({ liked: false, likeCount: 1 })),
    );
    expect(
      await source.getRepository(Reaction).countBy({ post: { id: postId }, userId: actorId }),
    ).toBe(0);
    expect(
      await source.getRepository(Reaction).countBy({ post: { id: postId }, userId: ownerId }),
    ).toBe(1);
  });

  it('hidden Post policy is enforced over HTTP and preserves stored reactions', async () => {
    await sendRequest('PUT', '/reactions/like', ownerId);
    await sendRequest('PUT', '/reactions/like');
    await source.getRepository(Post).update(postId, { isHidden: true });
    for (const method of ['PUT', 'DELETE']) {
      const response = await sendRequest(method, '/reactions/like');
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain('likeCount');
    }
    expect((await sendRequest('POST', '/comments', actorId, { content: 'denied' })).status).toBe(
      404,
    );
    expect((await sendRequest('POST', '/comments', ownerId, { content: 'denied' })).status).toBe(
      409,
    );
    expect((await sendRequest('PUT', '/reactions/like', ownerId)).status).toBe(409);
    expect((await sendRequest('DELETE', '/reactions/like', ownerId)).status).toBe(200);
    expect(
      await source.getRepository(Reaction).countBy({ post: { id: postId }, userId: actorId }),
    ).toBe(1);
    expect(await source.getRepository(Comment).count()).toBe(0);
    await source.getRepository(Post).update(postId, { isHidden: false });
    const restored = await sendRequest('PUT', '/reactions/like');
    expect(await restored.json()).toEqual({ liked: true, likeCount: 1 });
  });

  it('hidden parent replies are rejected for both authors and other users', async () => {
    const parent = await source
      .getRepository(Comment)
      .save({ post: { id: postId }, authorId: ownerId, content: 'root', isHidden: true });
    for (const actor of [ownerId, actorId]) {
      expect(
        (
          await sendRequest('POST', '/comments', actor, {
            content: 'denied',
            parentCommentId: parent.id,
          })
        ).status,
      ).toBe(404);
    }
    expect(await source.getRepository(Comment).count()).toBe(1);
  });

  it.each(['PUT', 'POST'])(
    'a committed hide wins against a blocked %s interaction',
    async (method) => {
      const runner = source.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      let pending: Promise<Response> | undefined;
      try {
        await runner.manager.getRepository(Post).update(postId, { isHidden: true });
        pending = sendRequest(
          method,
          method === 'PUT' ? '/reactions/like' : '/comments',
          actorId,
          method === 'PUT' ? undefined : { content: 'must not be saved' },
        );
        await waitForDatabaseLock();
        await runner.commitTransaction();
        expect((await pending).status).toBe(404);
        expect(await source.getRepository(Reaction).count()).toBe(0);
        expect(await source.getRepository(Comment).count()).toBe(0);
      } finally {
        if (runner.isTransactionActive) await runner.rollbackTransaction();
        await runner.release();
        if (pending) await pending;
      }
    },
  );

  it('a committed parent hide wins against a blocked reply', async () => {
    const parent = await source
      .getRepository(Comment)
      .save({ post: { id: postId }, authorId: ownerId, content: 'root' });
    const runner = source.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    let pending: Promise<Response> | undefined;
    try {
      await runner.manager.getRepository(Comment).update(parent.id, { isHidden: true });
      pending = sendRequest('POST', '/comments', actorId, {
        content: 'must not be saved',
        parentCommentId: parent.id,
      });
      await waitForDatabaseLock();
      await runner.commitTransaction();
      expect((await pending).status).toBe(404);
      expect(await source.getRepository(Comment).count()).toBe(1);
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
      if (pending) await pending;
    }
  });

  it('an AFTER INSERT database failure rolls back the like and releases locks', async () => {
    await source.query(
      `CREATE FUNCTION fail_test_reaction() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced_test_reaction_failure'; END $$`,
    );
    await source.query(
      'CREATE TRIGGER fail_test_reaction AFTER INSERT ON reactions FOR EACH ROW EXECUTE FUNCTION fail_test_reaction()',
    );
    try {
      const response = await sendRequest('PUT', '/reactions/like');
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain('forced_test_reaction_failure');
      expect(await source.getRepository(Reaction).count()).toBe(0);
    } finally {
      await source.query('DROP TRIGGER fail_test_reaction ON reactions');
      await source.query('DROP FUNCTION fail_test_reaction()');
    }
    const retry = await sendRequest('PUT', '/reactions/like');
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ liked: true, likeCount: 1 });
  });
});
