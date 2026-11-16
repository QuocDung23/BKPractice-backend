import { Inject, Injectable } from '@nestjs/common';

import { CourseNotFoundError } from '@/modules/courses/application/errors';
import type { Principal } from '@/modules/courses/application/models';
import type { IReorderChapterQuizzesPortIn } from '@/modules/courses/application/ports/in/reorder-chapter-quizzes.port.in';
import type { CourseQuizCatalog } from '@/modules/courses/application/ports/out';
import { COURSE_QUIZ_CATALOG } from '@/modules/courses/application/ports/out';
import type { ManagedCourseResult } from '@/modules/courses/application/results';
import {
  CourseAuthorizationService,
  CourseViewAssembler,
} from '@/modules/courses/application/services';
import { COURSE_REPOSITORY, COURSE_TRANSACTION_RUNNER } from '@/modules/courses/course.tokens';
import type { CourseRepository } from '@/modules/courses/domain/repositories';
import { ChapterId } from '@/modules/courses/domain/value-objects';
import type { TransactionRunner } from '@/modules/problems/application/ports/out';
@Injectable()
export class ReorderChapterQuizzesUseCase implements IReorderChapterQuizzesPortIn {
  constructor(
    private readonly authorization: CourseAuthorizationService,
    private readonly views: CourseViewAssembler,
    @Inject(COURSE_REPOSITORY) private readonly repository: CourseRepository,
    @Inject(COURSE_TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(COURSE_QUIZ_CATALOG) private readonly catalog: CourseQuizCatalog,
  ) {}
  async execute(
    p: Principal,
    courseId: string,
    chapterId: string,
    ids: string[],
  ): Promise<ManagedCourseResult> {
    this.authorization.requirePermission(p, 'course:update');
    return this.tx.run(async () => {
      const course = await this.repository.loadForUpdate(courseId);
      if (!course) throw new CourseNotFoundError('Course not found');
      this.authorization.requireOwner(p, course.createdBy.value);
      course.reorderQuizzes(ChapterId.from(chapterId), ids);
      await this.repository.save(course);
      return this.views.toManaged(course);
    });
  }
}
