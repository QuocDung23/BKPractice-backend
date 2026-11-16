import type { VisibleCourseStructure } from '@/modules/progress/domain/services';

export interface ManagedCourseStructure extends VisibleCourseStructure {
  readonly createdBy: string;
  readonly submissionProblemIds: readonly string[];
}
export interface StudentRosterEntry {
  readonly userId: string;
  readonly studentId: string | null;
  readonly displayName: string | null;
}
export interface StudentRosterPage {
  readonly items: readonly StudentRosterEntry[];
  readonly page: number;
  readonly limit: number;
  readonly hasMore: boolean;
}
export interface SubmissionCount {
  readonly userId: string;
  readonly problemId: string;
  readonly count: number;
}
export interface LocalCourseReportReader {
  loadCourse(courseId: string): Promise<ManagedCourseStructure | null>;
  loadSolved(
    userIds: readonly string[],
    problemIds: readonly string[],
  ): Promise<ReadonlyMap<string, ReadonlyMap<string, Date>>>;
  loadCompletedQuizzes(
    userIds: readonly string[],
    quizIds: readonly string[],
  ): Promise<ReadonlyMap<string, ReadonlyMap<string, Date>>>;
}
export interface RemoteCourseReportReader {
  loadStudents(page: number, limit: number): Promise<StudentRosterPage>;
  loadSubmissionCounts(
    userIds: readonly string[],
    problemIds: readonly string[],
  ): Promise<readonly SubmissionCount[]>;
}
export const LOCAL_COURSE_REPORT_READER = Symbol('LOCAL_COURSE_REPORT_READER');
export const REMOTE_COURSE_REPORT_READER = Symbol('REMOTE_COURSE_REPORT_READER');
