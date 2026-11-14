import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import type { CreateCommentDto } from './dto/create-comment.dto';
import type { CreatePostDto } from './dto/create-post.dto';
import { Comment } from './entities/comment.entity';
import { Post, PostScope } from './entities/post.entity';
import { Reaction, ReactionType } from './entities/reaction.entity';
import { POST_ERRORS, createPostError } from './post-errors';

@Injectable()
export class PostsService {
  constructor(
    @InjectRepository(Post) private readonly posts: Repository<Post>,
    @InjectRepository(Comment) private readonly comments: Repository<Comment>,
    @InjectRepository(Reaction) private readonly reactions: Repository<Reaction>,
  ) {}

  list(): Promise<Post[]> {
    return this.posts.find({
      where: { isHidden: false },
      order: { isPinned: 'DESC', createdAt: 'DESC' },
      take: 50,
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

  async comment(authorId: string, postId: string, dto: CreateCommentDto): Promise<Comment> {
    const post = await this.posts.findOneBy({ id: postId, isHidden: false });
    if (!post) throw createPostError(POST_ERRORS.postNotFound);
    let parent: Comment | null = null;
    if (dto.parentCommentId) {
      parent = await this.comments.findOne({
        where: { id: dto.parentCommentId },
        relations: { post: true, parentComment: true },
      });
      if (!parent || parent.post.id !== postId)
        throw createPostError(POST_ERRORS.commentParentNotFound);
      if (parent.parentComment) throw createPostError(POST_ERRORS.commentReplyDepthExceeded);
    }
    return this.comments.save(
      this.comments.create({ post, authorId, parentComment: parent, content: dto.content.trim() }),
    );
  }

  async toggleLike(userId: string, postId: string): Promise<{ liked: boolean }> {
    const existing = await this.reactions.findOne({ where: { post: { id: postId }, userId } });
    if (existing) {
      await this.reactions.remove(existing);
      return { liked: false };
    }
    const post = await this.posts.findOneBy({ id: postId });
    if (!post) throw createPostError(POST_ERRORS.postNotFound);
    await this.reactions.save(this.reactions.create({ post, userId, type: ReactionType.Like }));
    return { liked: true };
  }
}
