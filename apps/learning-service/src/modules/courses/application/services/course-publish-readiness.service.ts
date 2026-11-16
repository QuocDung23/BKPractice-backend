import { Inject, Injectable } from '@nestjs/common';

import { CourseNotReadyError } from '@/modules/courses/application/errors';
import {
  COURSE_QUIZ_CATALOG,
  type CourseProblemCatalog,
  type CourseQuizCatalog,
  type CourseQuizSummary,
  type ProblemSummary,
} from '@/modules/courses/application/ports/out';
import { COURSE_PROBLEM_CATALOG } from '@/modules/courses/course.tokens';
import type { Course } from '@/modules/courses/domain';
import { CourseReadiness } from '@/modules/courses/domain/services';

@Injectable()
export class CoursePublishReadinessService {
  constructor(
    private readonly readiness: CourseReadiness,
    @Inject(COURSE_PROBLEM_CATALOG) private readonly problems: CourseProblemCatalog,
    @Inject(COURSE_QUIZ_CATALOG) private readonly quizzes: CourseQuizCatalog,
  ) {}

  /** Mã lỗi readiness của Course theo trạng thái Learning Item hiện tại (rỗng nếu sẵn sàng). */
  async check(
    course: Course,
    foundProblems?: ReadonlyMap<string, ProblemSummary>,
    foundQuizzes?: ReadonlyMap<string, CourseQuizSummary>,
  ): Promise<string[]> {
    const problemIds = uniqueProblemIds(course);
    const quizIds = uniqueQuizIds(course);
    const [resolvedProblems, resolvedQuizzes] = await Promise.all([
      foundProblems ?? this.problems.findByIds(problemIds),
      foundQuizzes ?? this.quizzes.findByIds(quizIds),
    ]);
    const problemStates = problemIds.flatMap((id) => {
      const problem = resolvedProblems.get(id);
      return problem
        ? [
            {
              id,
              type: 'PROBLEM' as const,
              status: problem.publishStatus,
              isDeleted: problem.isDeleted,
            },
          ]
        : [];
    });
    const quizStates = quizIds.flatMap((id) => {
      const quiz = resolvedQuizzes.get(id);
      return quiz
        ? [
            {
              id,
              type: 'QUIZ' as const,
              status: quiz.status as 'DRAFT' | 'PUBLISHED' | 'ON_HOLD',
              isDeleted: quiz.deletedAt !== null,
            },
          ]
        : [];
    });
    return this.readiness.check(course, [...problemStates, ...quizStates]);
  }

  async assertReady(
    course: Course,
    foundProblems?: ReadonlyMap<string, ProblemSummary>,
    foundQuizzes?: ReadonlyMap<string, CourseQuizSummary>,
  ): Promise<void> {
    const issues = await this.check(course, foundProblems, foundQuizzes);
    if (issues.length > 0) throw new CourseNotReadyError(issues);
  }
}

export function uniqueProblemIds(course: Course): string[] {
  return [...new Set(course.chapters.flatMap((c) => c.problemRefs).map((ref) => ref.value))];
}

export function uniqueQuizIds(course: Course): string[] {
  return [...new Set(course.chapters.flatMap((c) => [...(c.quizRefs ?? [])]))];
}
