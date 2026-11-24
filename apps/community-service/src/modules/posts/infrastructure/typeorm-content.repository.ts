import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { ContentRepository } from '@/modules/posts/application/ports';
import type { EditableContent } from '@/modules/posts/application/ports';
import { canReadContent } from '@/modules/posts/domain';
import { Comment, Post } from '@/modules/posts/entities';
import { createPostError, POST_ERRORS } from '@/modules/posts/post-errors';

@Injectable()
export class TypeOrmContentRepository extends ContentRepository {
  constructor(@InjectDataSource() private readonly source: DataSource) {
    super();
  }

  async change(
    kind: 'post' | 'comment',
    id: string,
    actorId: string,
    mutate: (content: EditableContent) => void,
  ): Promise<EditableContent> {
    return this.source.transaction(async (manager) => {
      if (kind === 'post') {
        const repository = manager.getRepository(Post);
        const post = await repository.findOne({
          where: { id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!post) throw createPostError(POST_ERRORS.postNotFound);
        mutate(post);
        return repository.save(post);
      }
      const repository = manager.getRepository(Comment);
      const reference = await repository.findOne({
        where: { id },
        relations: { post: true, parentComment: true },
      });
      if (!reference) throw createPostError(POST_ERRORS.commentNotFound);
      const post = await manager
        .getRepository(Post)
        .findOne({ where: { id: reference.post.id }, lock: { mode: 'pessimistic_read' } });
      if (!post || !canReadContent(post, actorId))
        throw createPostError(POST_ERRORS.commentNotFound);
      if (reference.parentComment) {
        const parent = await repository.findOne({
          where: { id: reference.parentComment.id },
          lock: { mode: 'pessimistic_read' },
        });
        if (!parent || !canReadContent(parent, actorId))
          throw createPostError(POST_ERRORS.commentNotFound);
      }
      const comment = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!comment) throw createPostError(POST_ERRORS.commentNotFound);
      mutate(comment);
      const saved = await repository.save(comment);
      return {
        ...saved,
        postId: reference.post.id,
        parentCommentId: reference.parentComment?.id ?? null,
      };
    });
  }
}
