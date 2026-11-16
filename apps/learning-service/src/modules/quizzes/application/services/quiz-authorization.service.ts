import { Injectable } from '@nestjs/common';

import type { ContentRoot, Principal } from '@/modules/quizzes/domain';
import { QuizError } from '@/modules/quizzes/domain';
@Injectable()
export class QuizAuthorizationService {
  requirePermission(p: Principal, permission: string): void {
    if (
      !p.roles.some((r) => r === 'LECTURER' || r === 'ADMIN') ||
      !p.permissions.includes(permission)
    )
      throw new QuizError('FORBIDDEN', 'Missing role or permission');
  }
  requireOwner(p: Principal, root: ContentRoot): void {
    if (!p.roles.includes('ADMIN') && root.createdBy !== p.userId)
      throw new QuizError('FORBIDDEN', 'Only the owner can edit this content');
  }
  requireUse(p: Principal, root: ContentRoot, sharedWith: string[]): void {
    if (
      root.deletedAt ||
      (!p.roles.includes('ADMIN') && root.createdBy !== p.userId && !sharedWith.includes(p.userId))
    )
      throw new QuizError('NOT_FOUND', 'Content not available');
  }
  requireQuestionUse(
    p: Principal,
    root: ContentRoot & { isPrivate: boolean },
    sharedWith: string[],
  ): void {
    if (
      root.deletedAt ||
      (!p.roles.includes('ADMIN') &&
        root.createdBy !== p.userId &&
        root.isPrivate &&
        !sharedWith.includes(p.userId))
    )
      throw new QuizError('NOT_FOUND', 'Question not available');
  }
}
