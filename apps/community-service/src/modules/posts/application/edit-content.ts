import { Injectable } from '@nestjs/common';

import type { EditableContent } from '@/modules/posts/application/ports';
import { ContentRepository } from '@/modules/posts/application/ports';
import { checkContentOwnership } from '@/modules/posts/domain';
import { createPostError, POST_ERRORS } from '@/modules/posts/post-errors';

@Injectable()
export class EditContent {
  constructor(private readonly repository: ContentRepository) {}

  async execute(
    kind: 'post' | 'comment',
    id: string,
    actorId: string,
    content?: string,
  ): Promise<EditableContent> {
    return this.repository.change(kind, id, actorId, (current) => {
      const failure = checkContentOwnership(current, actorId);
      if (failure)
        throw createPostError(
          failure === 'notFound'
            ? kind === 'post'
              ? POST_ERRORS.postNotFound
              : POST_ERRORS.commentNotFound
            : POST_ERRORS[failure],
        );
      if (content === undefined) current.deletedAt = new Date();
      else {
        current.content = content;
        current.editedAt = new Date();
      }
    });
  }
}
