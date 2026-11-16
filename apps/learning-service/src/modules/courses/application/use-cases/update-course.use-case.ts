import type { TransactionRunner } from '@learning/modules/problems/application/ports/out/transaction-runner.port.out';
import { Inject, Injectable } from '@nestjs/common';

import type { UpdateCourseCommand } from '@/modules/courses/application/command';
import { CourseNotFoundError } from '@/modules/courses/application/errors';
import type { Principal } from '@/modules/courses/application/models';
import type { IUpdateCoursePortIn } from '@/modules/courses/application/ports/in';
import type { ManagedCourseResult } from '@/modules/courses/application/results';
import {
  CourseAuthorizationService,
  CoursePublishReadinessService,
  CourseViewAssembler,
} from '@/modules/courses/application/services';
import { COURSE_REPOSITORY, COURSE_TRANSACTION_RUNNER } from '@/modules/courses/course.tokens';
import type { CourseRepository } from '@/modules/courses/domain/repositories';

@Injectable()
export class UpdateCourseUseCase implements IUpdateCoursePortIn {
  constructor(
    private readonly authorization: CourseAuthorizationService,
    @Inject(COURSE_REPOSITORY) private readonly repository: CourseRepository,
    @Inject(COURSE_TRANSACTION_RUNNER) private readonly transactionRunner: TransactionRunner,
    private readonly views: CourseViewAssembler,
    private readonly readiness: CoursePublishReadinessService,
  ) {}
  async execute(
    principal: Principal,
    courseId: string,
    command: UpdateCourseCommand,
    now = new Date(),
  ): Promise<ManagedCourseResult> {
    this.authorization.requirePermission(principal, 'course:update');
    return this.transactionRunner.run(async () => {
      const course = await this.repository.loadForUpdate(courseId);
      if (!course) throw new CourseNotFoundError('Course not found');
      this.authorization.requireOwnership(principal, course.createdBy.value);
      course.update(command, now);
      if (course.isPublished) await this.readiness.assertReady(course);
      await this.repository.save(course);
      return this.views.toManaged(course);
    });
  }
}
