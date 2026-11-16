import type { Principal } from '@/modules/courses/application/models';
import type { ManagedCourseResult } from '@/modules/courses/application/results';
export const ATTACH_QUIZ_PORT_IN = Symbol('AttachQuizPortIn');
export interface IAttachQuizPortIn {
  execute(
    p: Principal,
    courseId: string,
    chapterId: string,
    quizId: string,
    position?: number,
  ): Promise<ManagedCourseResult>;
}
