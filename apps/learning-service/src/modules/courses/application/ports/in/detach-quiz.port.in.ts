import type { Principal } from '@/modules/courses/application/models';
import type { ManagedCourseResult } from '@/modules/courses/application/results';
export const DETACH_QUIZ_PORT_IN = Symbol('DetachQuizPortIn');
export interface IDetachQuizPortIn {
  execute(
    p: Principal,
    courseId: string,
    chapterId: string,
    quizId: string,
  ): Promise<ManagedCourseResult>;
}
