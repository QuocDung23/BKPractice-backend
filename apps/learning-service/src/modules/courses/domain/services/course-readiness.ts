import type { Course } from '@/modules/courses/domain';
import { DomainValidationError } from '@/modules/courses/domain/errors';

export interface ProblemStateForReadiness {
  readonly problemId: string;
  readonly publishStatus: 'DRAFT' | 'PUBLISHED' | 'ON_HOLD';
  readonly isDeleted: boolean;
}

export type LearningItemType = 'PROBLEM' | 'QUIZ';

export interface LearningItemState {
  readonly id: string;
  readonly type: LearningItemType;
  readonly status: 'DRAFT' | 'PUBLISHED' | 'ON_HOLD';
  readonly isDeleted: boolean;
}

export class CourseReadiness {
  check(course: Course, itemStates: readonly LearningItemState[]): string[] {
    const issues: string[] = [];
    if (course.title.value.trim().length === 0) issues.push('TITLE_REQUIRED');
    if (course.chapters.length === 0) issues.push('CHAPTER_REQUIRED');
    const linkedItemKeys = new Set(
      course.chapters.flatMap((chapter) => [
        ...chapter.problemRefs.map((ref) => itemKey('PROBLEM', ref.value)),
        ...(chapter.quizRefs ?? []).map((id) => itemKey('QUIZ', id)),
      ]),
    );
    const hasPublishedContent = itemStates.some(
      (state) =>
        linkedItemKeys.has(itemKey(state.type, state.id)) &&
        state.status === 'PUBLISHED' &&
        !state.isDeleted,
    );
    if (!hasPublishedContent) issues.push('PUBLISHED_CONTENT_REQUIRED');
    return issues;
  }

  isReady(course: Course, itemStates: readonly LearningItemState[]): boolean {
    return this.check(course, itemStates).length === 0;
  }
}

function itemKey(type: LearningItemType, id: string): string {
  return `${type}:${id}`;
}

export class ProblemAttachPolicy {
  isAttachable(problemState: ProblemStateForReadiness | undefined): boolean {
    return problemState !== undefined && !problemState.isDeleted;
  }

  assertAttachable(problemState: ProblemStateForReadiness | undefined): void {
    if (!this.isAttachable(problemState)) {
      throw new DomainValidationError('problemId', 'Problem is not attachable');
    }
  }
}
