import type { TransactionRunner } from '@learning/modules/problems/application/ports/out/transaction-runner.port.out';
import { Inject, Injectable } from '@nestjs/common';

import { CourseNotFoundError } from '@/modules/courses/application/errors';
import type { Principal } from '@/modules/courses/application/models';
import type { IDeleteCoursePortIn } from '@/modules/courses/application/ports/in';
import { CourseAuthorizationService } from '@/modules/courses/application/services';
import { COURSE_REPOSITORY, COURSE_TRANSACTION_RUNNER } from '@/modules/courses/course.tokens';
import type { CourseRepository } from '@/modules/courses/domain/repositories';

@Injectable()
export class DeleteCourseUseCase implements IDeleteCoursePortIn {
  constructor(
    private readonly authorization: CourseAuthorizationService,
    @Inject(COURSE_REPOSITORY) private readonly repository: CourseRepository,
    @Inject(COURSE_TRANSACTION_RUNNER) private readonly transactionRunner: TransactionRunner,
  ) {}

  async execute(principal: Principal, courseId: string, now = new Date()): Promise<void> {
    this.authorization.requirePermission(principal, 'course:delete');
    await this.transactionRunner.run(async () => {
      const course = await this.repository.loadForUpdate(courseId);
      if (!course) throw new CourseNotFoundError('Course not found');
      this.authorization.requireOwnership(principal, course.createdBy.value);
      if (course.isDraft) {
        const removed = await this.repository.hardDelete(courseId);
        if (!removed) throw new CourseNotFoundError('Course not found');
        return;
      }
      course.softDelete(now);
      await this.repository.save(course);
    });
  }
}
