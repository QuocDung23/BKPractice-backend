import { IsNull } from 'typeorm';
import type { Repository } from 'typeorm';

import { PostPageQueryDto } from '@/modules/posts/dto';
import type { Comment, Post, Reaction } from '@/modules/posts/entities';
import { PostsService } from '@/modules/posts/posts.service';

function createFeedFixture(rows: { id: string }[]) {
  const posts = { findAndCount: jest.fn().mockResolvedValue([rows, rows.length]) };
  const builder = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([
      { postId: 'p2', likeCount: '7', likedByMe: false },
      { postId: 'p1', likeCount: '2', likedByMe: true },
    ]),
  };
  const reactions = { createQueryBuilder: jest.fn().mockReturnValue(builder) };
  const service = new PostsService(
    posts as unknown as Repository<Post>,
    {} as Repository<Comment>,
    reactions as unknown as Repository<Reaction>,
  );
  return { service, posts, builder, reactions };
}

describe('Post feed reaction aggregation', () => {
  it('does not query reactions for an empty feed', async () => {
    const f = createFeedFixture([]);
    expect(await f.service.list('viewer', new PostPageQueryDto())).toEqual({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });
    expect(f.reactions.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('uses one batch, maps by post ID and preserves order with typed defaults', async () => {
    const f = createFeedFixture([{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]);
    expect((await f.service.list('viewer', new PostPageQueryDto())).items).toEqual([
      expect.objectContaining({ id: 'p1', likeCount: 2, likedByMe: true }),
      expect.objectContaining({ id: 'p2', likeCount: 7, likedByMe: false }),
      expect.objectContaining({ id: 'p3', likeCount: 0, likedByMe: false }),
    ]);
    expect(f.posts.findAndCount).toHaveBeenCalledWith({
      where: { isHidden: false, deletedAt: IsNull() },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: 0,
      take: 20,
    });
    expect(f.reactions.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(f.builder.getRawMany).toHaveBeenCalledTimes(1);
    expect(f.builder.where).toHaveBeenCalledWith('reaction.post_id IN (:...postIds)', {
      postIds: ['p1', 'p2', 'p3'],
    });
    expect(f.builder.setParameter).toHaveBeenCalledWith('userId', 'viewer');
  });
});
