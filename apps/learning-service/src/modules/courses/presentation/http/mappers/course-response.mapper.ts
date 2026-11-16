import type {
  LearnerCourseResult,
  LearnerCourseSummaryResult,
  ManagedCourseResult,
  ManagedCourseSummaryResult,
} from '@/modules/courses/application/results';
import type { CoursePage } from '@/modules/courses/domain/repositories';
import type {
  CourseDetailResponseDto,
  CourseListResponseDto,
  ManagedCourseListResponseDto,
  ManagedCourseResponseDto,
  ManagedCourseSummaryResponseDto,
} from '@/modules/courses/presentation/http/dto';

const iso = (date: Date | null): string | null => (date === null ? null : date.toISOString());

export function toCourseDetailResponse(course: LearnerCourseResult): CourseDetailResponseDto {
  return {
    id: course.id,
    slug: course.slug,
    title: course.title,
    description: course.description,
    chapters: course.chapters.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      description: chapter.description,
      quizzes: chapter.quizzes?.map((q) => ({ id: q.id, title: q.title })),
      problems: chapter.problems.map((p) => ({
        id: p.id,
        slug: p.slug,
        title: p.title,
        problemType: p.problemType,
        difficulty: p.difficulty,
      })),
    })),
  };
}

export function toCourseListResponse(
  page: CoursePage<LearnerCourseSummaryResult>,
): CourseListResponseDto {
  return {
    items: page.items.map((c) => ({
      id: c.id,
      slug: c.slug,
      title: c.title,
      chapterCount: c.chapterCount,
    })),
    total: page.total,
    page: page.page,
    pageSize: page.limit,
  };
}

export function toManagedCourseResponse(course: ManagedCourseResult): ManagedCourseResponseDto {
  return {
    id: course.id,
    slug: course.slug,
    title: course.title,
    description: course.description,
    status: course.status,
    createdBy: course.createdBy,
    createdAt: course.createdAt.toISOString(),
    updatedAt: course.updatedAt.toISOString(),
    deletedAt: iso(course.deletedAt),
    chapters: course.chapters.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      description: chapter.description,
      quizzes: chapter.quizzes?.map((q) => ({ id: q.id, title: q.title })),
      problems: chapter.problems.map((p) => ({ ...p })),
    })),
    readiness: { ready: course.readiness.ready, issues: [...course.readiness.issues] },
  };
}

function toManagedSummary(course: ManagedCourseSummaryResult): ManagedCourseSummaryResponseDto {
  return {
    id: course.id,
    slug: course.slug,
    title: course.title,
    status: course.status,
    chapterCount: course.chapterCount,
    createdAt: course.createdAt.toISOString(),
    updatedAt: course.updatedAt.toISOString(),
    deletedAt: iso(course.deletedAt),
  };
}

export function toManagedCourseListResponse(
  page: CoursePage<ManagedCourseSummaryResult>,
): ManagedCourseListResponseDto {
  return {
    items: page.items.map(toManagedSummary),
    total: page.total,
    page: page.page,
    pageSize: page.limit,
  };
}
