import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { canReadContent } from '@/modules/posts/domain';
import type {
  CommentPageDto,
  CommentPageQueryDto,
  CommentSummaryDto,
  CreateCommentDto,
  CreatePostDto,
  PostSummaryDto,
  PostPageDto,
  PostPageQueryDto,
  ReactionStateDto,
  ReplyPageDto,
  ReplySummaryDto,
} from '@/modules/posts/dto';
import { Comment, Post, PostScope, Reaction, ReactionType } from '@/modules/posts/entities';
import { POST_ERRORS, createPostError } from '@/modules/posts/post-errors';

@Injectable()
export class PostsService {
  constructor(
    @InjectRepository(Post) private readonly posts: Repository<Post>,
    @InjectRepository(Comment) private readonly comments: Repository<Comment>,
    @InjectRepository(Reaction) private readonly reactions: Repository<Reaction>,
  ) {}

  async list(userId: string, query: PostPageQueryDto): Promise<PostPageDto> {
    if (
      (query.problemId && query.courseId) ||
      (query.problemId && query.scope && query.scope !== PostScope.Problem) ||
      (query.courseId && query.scope && query.scope !== PostScope.Course)
    )
      throw new BadRequestException('Post filters do not match the scope.');
    const [posts, total] = await this.posts.findAndCount({
      where: {
        isHidden: false,
        deletedAt: IsNull(),
        ...(query.scope ? { scope: query.scope } : {}),
        ...(query.problemId ? { problemId: query.problemId } : {}),
        ...(query.courseId ? { courseId: query.courseId } : {}),
      },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    const items = await this.summarizePosts(posts, userId);
    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  async get(userId: string, postId: string): Promise<PostSummaryDto> {
    const post = await this.posts.findOneBy({ id: postId });
    if (!post || !canReadContent(post, userId)) throw createPostError(POST_ERRORS.postNotFound);
    const [summary] = await this.summarizePosts([post], userId);
    return summary!;
  }

  private async summarizePosts(posts: Post[], userId: string): Promise<PostSummaryDto[]> {
    if (posts.length === 0) return [];
    const summaries = await this.reactions
      .createQueryBuilder('reaction')
      .select('reaction.post_id', 'postId')
      .addSelect('COUNT(*)', 'likeCount')
      .addSelect('BOOL_OR(reaction.user_id = :userId)', 'likedByMe')
      .where('reaction.post_id IN (:...postIds)', { postIds: posts.map((post) => post.id) })
      .andWhere('reaction.type = :type', { type: ReactionType.Like })
      .setParameter('userId', userId)
      .groupBy('reaction.post_id')
      .getRawMany<{ postId: string; likeCount: string; likedByMe: boolean }>();
    const reactionsByPost = new Map(summaries.map((summary) => [summary.postId, summary]));
    return posts.map((post) => {
      const summary = reactionsByPost.get(post.id);
      return {
        id: post.id,
        authorId: post.authorId,
        scope: post.scope,
        content: post.content,
        problemId: post.problemId,
        courseId: post.courseId,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        editedAt: post.editedAt,
        ...(post.authorId === userId
          ? {
              deletedAt: post.deletedAt,
              moderation: { status: post.isHidden ? ('HIDDEN' as const) : ('VISIBLE' as const) },
            }
          : {}),
        likeCount: Number(summary?.likeCount ?? 0),
        likedByMe: summary?.likedByMe ?? false,
      };
    });
  }

  create(authorId: string, dto: CreatePostDto): Promise<Post> {
    return this.posts.save(
      this.posts.create({
        authorId,
        scope: dto.scope,
        content: dto.content.trim(),
        problemId: dto.scope === PostScope.Problem ? (dto.problemId ?? null) : null,
        courseId: dto.scope === PostScope.Course ? (dto.courseId ?? null) : null,
      }),
    );
  }

  async listComments(
    userId: string,
    postId: string,
    query: CommentPageQueryDto,
  ): Promise<CommentPageDto> {
    return this.posts.manager.transaction('REPEATABLE READ', async (manager) => {
      const post = await manager.getRepository(Post).findOneBy({ id: postId });
      if (!post || !canReadContent(post, userId)) throw createPostError(POST_ERRORS.postNotFound);
      const comments = manager.getRepository(Comment);
      const root = { post: { id: postId }, parentComment: IsNull(), deletedAt: IsNull() };
      const [roots, total] = await comments.findAndCount({
        where: [
          { ...root, isHidden: false },
          { ...root, authorId: userId },
        ],
        order: { createdAt: 'ASC', id: 'ASC' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      });
      const replyCounts =
        roots.length === 0
          ? []
          : await comments
              .createQueryBuilder('reply')
              .select('reply.parent_comment_id', 'parentId')
              .addSelect('COUNT(*)', 'replyCount')
              .where('reply.parent_comment_id IN (:...rootIds)', {
                rootIds: roots.map((comment) => comment.id),
              })
              .andWhere('reply.post_id = :postId', { postId })
              .andWhere('reply.deleted_at IS NULL')
              .andWhere('(reply.is_hidden = false OR reply.author_id = :userId)', { userId })
              .groupBy('reply.parent_comment_id')
              .getRawMany<{ parentId: string; replyCount: string }>();
      const countsByRoot = new Map(
        replyCounts.map((count) => [count.parentId, Number(count.replyCount)]),
      );
      const items: CommentSummaryDto[] = roots.map((comment) => ({
        id: comment.id,
        postId,
        parentCommentId: null,
        authorId: comment.authorId,
        content: comment.content,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        editedAt: comment.editedAt,
        replyCount: countsByRoot.get(comment.id) ?? 0,
        ...(comment.authorId === userId
          ? {
              moderation: { status: comment.isHidden ? ('HIDDEN' as const) : ('VISIBLE' as const) },
            }
          : {}),
      }));
      return { items, page: query.page, pageSize: query.pageSize, total };
    });
  }

  async listReplies(
    userId: string,
    rootId: string,
    query: CommentPageQueryDto,
  ): Promise<ReplyPageDto> {
    return this.posts.manager.transaction('REPEATABLE READ', async (manager) => {
      const comments = manager.getRepository(Comment);
      const root = await comments.findOne({
        where: { id: rootId },
        relations: { post: true, parentComment: true },
      });
      if (
        !root ||
        root.parentComment ||
        !canReadContent(root, userId) ||
        !canReadContent(root.post, userId)
      )
        throw createPostError(POST_ERRORS.commentNotFound);
      const parent = {
        post: { id: root.post.id },
        parentComment: { id: rootId },
        deletedAt: IsNull(),
      };
      const [replies, total] = await comments.findAndCount({
        where: [
          { ...parent, isHidden: false },
          { ...parent, authorId: userId },
        ],
        order: { createdAt: 'ASC', id: 'ASC' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      });
      const items: ReplySummaryDto[] = replies.map((reply) => ({
        id: reply.id,
        postId: root.post.id,
        parentCommentId: rootId,
        authorId: reply.authorId,
        content: reply.content,
        createdAt: reply.createdAt,
        updatedAt: reply.updatedAt,
        editedAt: reply.editedAt,
        ...(reply.authorId === userId
          ? { moderation: { status: reply.isHidden ? ('HIDDEN' as const) : ('VISIBLE' as const) } }
          : {}),
      }));
      return { items, page: query.page, pageSize: query.pageSize, total };
    });
  }

  async comment(authorId: string, postId: string, dto: CreateCommentDto): Promise<Comment> {
    return this.posts.manager.transaction(async (manager) => {
      const posts = manager.getRepository(Post);
      const comments = manager.getRepository(Comment);
      const post = await posts.findOne({
        where: { id: postId },
        lock: { mode: 'pessimistic_read' },
      });
      if (!post || !canReadContent(post, authorId)) throw createPostError(POST_ERRORS.postNotFound);
      if (post.isHidden) throw createPostError(POST_ERRORS.postInteractionDisabled);
      let parent: Comment | null = null;
      if (dto.parentCommentId) {
        parent = await comments.findOne({
          where: { id: dto.parentCommentId },
          relations: { post: true, parentComment: true },
          lock: { mode: 'pessimistic_read', tables: ['comments'] },
        });
        if (!parent || parent.post.id !== postId || parent.isHidden || parent.deletedAt)
          throw createPostError(POST_ERRORS.commentParentNotFound);
        if (parent.parentComment) throw createPostError(POST_ERRORS.commentReplyDepthExceeded);
      }
      return comments.save(
        comments.create({ post, authorId, parentComment: parent, content: dto.content.trim() }),
      );
    });
  }

  async setPostLike(userId: string, postId: string, liked: boolean): Promise<ReactionStateDto> {
    return this.reactions.manager.transaction(async (manager) => {
      const post = await manager.getRepository(Post).findOne({
        where: { id: postId },
        lock: { mode: 'pessimistic_read' },
      });
      if (!post || !canReadContent(post, userId)) throw createPostError(POST_ERRORS.postNotFound);
      if (liked && post.isHidden) throw createPostError(POST_ERRORS.postInteractionDisabled);
      const reactions = manager.getRepository(Reaction);
      if (liked) {
        await reactions
          .createQueryBuilder()
          .insert()
          .into(Reaction)
          .values({ post: { id: postId }, userId, type: ReactionType.Like })
          .orIgnore()
          .execute();
      } else {
        await reactions.delete({ post: { id: postId }, userId });
      }
      const likeCount = await reactions.countBy({ post: { id: postId }, type: ReactionType.Like });
      return { liked, likeCount };
    });
  }
}
