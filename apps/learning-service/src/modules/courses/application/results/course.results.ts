import type { CourseStatus } from '@/modules/courses/domain/value-objects';

export interface ProblemSummaryResult {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly problemType: string;
  readonly difficulty: string;
}

export interface LearnerChapterResult {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly quizzes?: readonly { id: string; title: string; status?: string }[];
  readonly problems: readonly ProblemSummaryResult[];
}

/** Biểu diễn hướng người học: không có trạng thái, người tạo hay Problem bị ẩn (FR-010). */
export interface LearnerCourseResult {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string | null;
  readonly chapters: readonly LearnerChapterResult[];
}

export interface LearnerCourseSummaryResult {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly chapterCount: number;
}

/** Trạng thái một Problem đã xếp; các trường là null khi Problem không còn tồn tại. */
export interface ManagedProblemResult {
  readonly problemId: string;
  readonly slug: string | null;
  readonly title: string | null;
  readonly publishStatus: 'DRAFT' | 'PUBLISHED' | 'ON_HOLD' | null;
  readonly isDeleted: boolean | null;
}

export interface ManagedChapterResult {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly quizzes?: readonly { id: string; title: string; status?: string }[];
  readonly problems: readonly ManagedProblemResult[];
}

export interface ReadinessResult {
  readonly ready: boolean;
  readonly issues: readonly string[];
}

export interface ManagedCourseResult {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: CourseStatus;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
  readonly chapters: readonly ManagedChapterResult[];
  readonly readiness: ReadinessResult;
}

export interface ManagedCourseSummaryResult {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly status: CourseStatus;
  readonly chapterCount: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}
