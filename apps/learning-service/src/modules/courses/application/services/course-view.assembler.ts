import { Inject, Injectable } from '@nestjs/common';

import type {
  CourseProblemCatalog,
  CourseQuizCatalog,
} from '@/modules/courses/application/ports/out';
import { COURSE_QUIZ_CATALOG } from '@/modules/courses/application/ports/out';
import type {
  LearnerCourseResult,
  LearnerCourseSummaryResult,
  ManagedCourseResult,
  ManagedCourseSummaryResult,
} from '@/modules/courses/application/results';
import {
  CoursePublishReadinessService,
  uniqueProblemIds,
  uniqueQuizIds,
} from '@/modules/courses/application/services/course-publish-readiness.service';
import { COURSE_PROBLEM_CATALOG } from '@/modules/courses/course.tokens';
import type { Course } from '@/modules/courses/domain';

@Injectable()
export class CourseViewAssembler {
  constructor(
    @Inject(COURSE_PROBLEM_CATALOG) private readonly catalog: CourseProblemCatalog,
    private readonly readiness: CoursePublishReadinessService,
    @Inject(COURSE_QUIZ_CATALOG) private readonly quizzes: CourseQuizCatalog,
  ) {}

  /** Chỉ Problem `PUBLISHED` chưa xoá mềm, giữ thứ tự; Problem khác bị bỏ như chưa từng có (FR-010). */
  async toLearner(course: Course): Promise<LearnerCourseResult> {
    const [found, quizzes] = await Promise.all([
      this.catalog.findByIds(uniqueProblemIds(course)),
      this.quizzes.findByIds(uniqueQuizIds(course)),
    ]);
    return {
      id: course.id.value,
      slug: course.slug.value,
      title: course.title.value,
      description: course.description.value,
      chapters: course.chapters.map((chapter) => ({
        id: chapter.id.value,
        title: chapter.title.value,
        description: chapter.description.value,
        quizzes: (chapter.quizRefs ?? []).flatMap((id) => {
          const q = quizzes.get(id);
          return q && q.status === 'PUBLISHED' && !q.deletedAt
            ? [{ id: q.id, title: q.title }]
            : [];
        }),
        problems: chapter.problemRefs.flatMap((ref) => {
          const problem = found.get(ref.value);
          if (!problem || problem.isDeleted || problem.publishStatus !== 'PUBLISHED') return [];
          return [
            {
              id: problem.id,
              slug: problem.slug,
              title: problem.title,
              problemType: problem.problemType,
              difficulty: problem.difficulty,
            },
          ];
        }),
      })),
    };
  }

  toLearnerSummary(course: Course): LearnerCourseSummaryResult {
    return {
      id: course.id.value,
      slug: course.slug.value,
      title: course.title.value,
      chapterCount: course.chapters.length,
    };
  }

  /** Quản lý: trạng thái từng Problem đã xếp và lỗi readiness (FR-011). */
  async toManaged(course: Course): Promise<ManagedCourseResult> {
    const [found, quizzes] = await Promise.all([
      this.catalog.findByIds(uniqueProblemIds(course)),
      this.quizzes.findByIds(uniqueQuizIds(course)),
    ]);
    const issues = await this.readiness.check(course, found, quizzes);
    return {
      id: course.id.value,
      slug: course.slug.value,
      title: course.title.value,
      description: course.description.value,
      status: course.status,
      createdBy: course.createdBy.value,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
      deletedAt: course.deletedMarker.deletedAt,
      chapters: course.chapters.map((chapter) => ({
        id: chapter.id.value,
        title: chapter.title.value,
        description: chapter.description.value,
        quizzes: (chapter.quizRefs ?? []).flatMap((id) => {
          const q = quizzes.get(id);
          return q ? [{ id: q.id, title: q.title, status: q.status }] : [];
        }),
        problems: chapter.problemRefs.map((ref) => {
          const problem = found.get(ref.value);
          return {
            problemId: ref.value,
            slug: problem?.slug ?? null,
            title: problem?.title ?? null,
            publishStatus: problem?.publishStatus ?? null,
            isDeleted: problem?.isDeleted ?? null,
          };
        }),
      })),
      readiness: { ready: issues.length === 0, issues },
    };
  }

  toManagedSummary(course: Course): ManagedCourseSummaryResult {
    return {
      id: course.id.value,
      slug: course.slug.value,
      title: course.title.value,
      status: course.status,
      chapterCount: course.chapters.length,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
      deletedAt: course.deletedMarker.deletedAt,
    };
  }
}
