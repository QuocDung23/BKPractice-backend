import type { Repository } from 'typeorm';

import type { Comment } from './entities/comment.entity';
import type { Post } from './entities/post.entity';
import type { Reaction } from './entities/reaction.entity';
import { PostsService } from './posts.service';

interface Failure {
  getStatus(): number;
  code: string;
}

function serviceWith(overrides: {
  posts?: Partial<Record<'findOneBy', jest.Mock>>;
  comments?: Partial<Record<'findOne', jest.Mock>>;
  reactions?: Partial<Record<'findOne', jest.Mock>>;
}): PostsService {
  return new PostsService(
    { findOneBy: jest.fn(), ...overrides.posts } as unknown as Repository<Post>,
    {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      ...overrides.comments,
    } as unknown as Repository<Comment>,
    { findOne: jest.fn(), ...overrides.reactions } as unknown as Repository<Reaction>,
  );
}

async function failureOf(action: Promise<unknown>): Promise<Failure> {
  return (await action.then(
    () => {
      throw new Error('expected the call to fail');
    },
    (caught: unknown) => caught,
  )) as Failure;
}

const DTO = { content: 'noi dung' };

describe('PostsService errors', () => {
  it('reports POST_NOT_FOUND when commenting on a missing or hidden post', async () => {
    const service = serviceWith({ posts: { findOneBy: jest.fn().mockResolvedValue(null) } });
    const error = await failureOf(service.comment('u1', 'p1', DTO));
    expect(error.getStatus()).toBe(404);
    expect(error.code).toBe('POST_NOT_FOUND');
  });

  it('reports POST_NOT_FOUND when liking a missing post', async () => {
    const service = serviceWith({
      reactions: { findOne: jest.fn().mockResolvedValue(null) },
      posts: { findOneBy: jest.fn().mockResolvedValue(null) },
    });
    const error = await failureOf(service.toggleLike('u1', 'p1'));
    expect(error.code).toBe('POST_NOT_FOUND');
  });

  it.each([
    ['the parent comment does not exist', null],
    ['the parent comment belongs to another post', { post: { id: 'other' }, parentComment: null }],
  ])('reports COMMENT_PARENT_NOT_FOUND when %s', async (_case, parent) => {
    const service = serviceWith({
      posts: { findOneBy: jest.fn().mockResolvedValue({ id: 'p1' }) },
      comments: { findOne: jest.fn().mockResolvedValue(parent) },
    });
    const error = await failureOf(service.comment('u1', 'p1', { ...DTO, parentCommentId: 'c1' }));
    expect(error.getStatus()).toBe(404);
    expect(error.code).toBe('COMMENT_PARENT_NOT_FOUND');
  });

  it('reports COMMENT_REPLY_DEPTH_EXCEEDED when replying to a reply', async () => {
    const service = serviceWith({
      posts: { findOneBy: jest.fn().mockResolvedValue({ id: 'p1' }) },
      comments: {
        findOne: jest.fn().mockResolvedValue({ post: { id: 'p1' }, parentComment: { id: 'root' } }),
      },
    });
    const error = await failureOf(service.comment('u1', 'p1', { ...DTO, parentCommentId: 'c1' }));
    expect(error.getStatus()).toBe(422);
    expect(error.code).toBe('COMMENT_REPLY_DEPTH_EXCEEDED');
  });
});
