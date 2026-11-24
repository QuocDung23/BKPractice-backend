import type { ContentState } from '@/modules/posts/domain';

export interface EditableContent extends ContentState {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  postId?: string;
  parentCommentId?: string | null;
  content: string;
  editedAt: Date | null;
}
export abstract class ContentRepository {
  abstract change(
    kind: 'post' | 'comment',
    id: string,
    actorId: string,
    mutate: (content: EditableContent) => void,
  ): Promise<EditableContent>;
}
