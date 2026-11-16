import type { Principal } from '@/modules/courses/application/models';
import type { ManagedCourseResult } from '@/modules/courses/application/results';
export const REORDER_CHAPTER_QUIZZES_PORT_IN = Symbol('ReorderChapterQuizzesPortIn');
export interface IReorderChapterQuizzesPortIn {
  execute(
    p: Principal,
    courseId: string,
    chapterId: string,
    ids: string[],
  ): Promise<ManagedCourseResult>;
}
