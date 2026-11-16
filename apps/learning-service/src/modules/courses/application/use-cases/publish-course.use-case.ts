import type { TransactionRunner } from '@learning/modules/problems/application/ports/out/transaction-runner.port.out';
import { Inject, Injectable } from '@nestjs/common';

import { CourseNotFoundError } from '@/modules/courses/application/errors';
import type { Principal } from '@/modules/courses/application/models';
import type { IPublishCoursePortIn } from '@/modules/courses/application/ports/in';
import type { ManagedCourseResult } from '@/modules/courses/application/results';
import {
  CourseAuthorizationService,
  CoursePublishReadinessService,
  CourseViewAssembler,
} from '@/modules/courses/application/services';
import { COURSE_REPOSITORY, COURSE_TRANSACTION_RUNNER } from '@/modules/courses/course.tokens';
import { InvalidCourseState } from '@/modules/courses/domain/errors';
import type { CourseRepository } from '@/modules/courses/domain/repositories';

@Injectable()
export class PublishCourseUseCase implements IPublishCoursePortIn {
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
    now = new Date(),
  ): Promise<ManagedCourseResult> {
    this.authorization.requirePermission(principal, 'course:publish');
    return this.transactionRunner.run(async () => {
      const course = await this.repository.loadForUpdate(courseId);
      if (!course) throw new CourseNotFoundError('Course not found');
      this.authorization.requireOwnership(principal, course.createdBy.value);
      if (!course.isDraft)
        throw new InvalidCourseState(
          'status',
          `Cannot publish a course with status ${course.status}`,
        );
      await this.readiness.assertReady(course);
      course.publish(now);
      await this.repository.save(course);
      return this.views.toManaged(course);
    });
  }
}
