export interface ContentState {
  authorId: string;
  isHidden: boolean;
  deletedAt: Date | null;
}

export function canReadContent(content: ContentState, viewerId: string): boolean {
  return !content.deletedAt && (!content.isHidden || content.authorId === viewerId);
}

export function checkContentOwnership(
  content: ContentState,
  actorId: string,
): 'forbidden' | 'notFound' | 'invalidState' | undefined {
  if (content.authorId !== actorId)
    return canReadContent(content, actorId) ? 'forbidden' : 'notFound';
  if (content.deletedAt) return 'invalidState';
}
