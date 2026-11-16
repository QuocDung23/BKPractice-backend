import type { TransactionRunner } from '@learning/modules/problems/application/ports/out/transaction-runner.port.out';
import { Inject, Injectable } from '@nestjs/common';

import { CourseNotFoundError } from '@/modules/courses/application/errors';
import type { Principal } from '@/modules/courses/application/models';
import type { IAddChapterPortIn } from '@/modules/courses/application/ports/in';
import type { ManagedCourseResult } from '@/modules/courses/application/results';
import {
  CourseAuthorizationService,
  CourseViewAssembler,
} from '@/modules/courses/application/services';
import { COURSE_REPOSITORY, COURSE_TRANSACTION_RUNNER } from '@/modules/courses/course.tokens';
import type { CourseRepository } from '@/modules/courses/domain/repositories';
import type { ChapterDescription, ChapterTitle } from '@/modules/courses/domain/value-objects';

@Injectable()
export class AddChapterUseCase implements IAddChapterPortIn {
  constructor(
    private readonly authorization: CourseAuthorizationService,
    @Inject(COURSE_REPOSITORY) private readonly repository: CourseRepository,
    @Inject(COURSE_TRANSACTION_RUNNER) private readonly transactionRunner: TransactionRunner,
    private readonly views: CourseViewAssembler,
  ) {}
  async execute(
    principal: Principal,
    courseId: string,
    title: ChapterTitle,
    description: ChapterDescription | null = null,
    position?: number,
    now = new Date(),
  ): Promise<ManagedCourseResult> {
    this.authorization.requirePermission(principal, 'course:update');
    return this.transactionRunner.run(async () => {
      const course = await this.repository.loadForUpdate(courseId);
      if (!course) throw new CourseNotFoundError('Course not found');
      this.authorization.requireOwnership(principal, course.createdBy.value);
      course.addChapter({ title, description, position }, now);
      await this.repository.save(course);
      return this.views.toManaged(course);
    });
  }
}
