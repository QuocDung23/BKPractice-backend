import type { TransactionRunner } from '@learning/modules/problems/application/ports/out/transaction-runner.port.out';
import { Inject, Injectable } from '@nestjs/common';

import { CourseNotFoundError } from '@/modules/courses/application/errors';
import type { Principal } from '@/modules/courses/application/models';
import type { IDetachProblemPortIn } from '@/modules/courses/application/ports/in';
import {
  CourseAuthorizationService,
  CoursePublishReadinessService,
} from '@/modules/courses/application/services';
import { COURSE_REPOSITORY, COURSE_TRANSACTION_RUNNER } from '@/modules/courses/course.tokens';
import type { CourseRepository } from '@/modules/courses/domain/repositories';
import type { ChapterId, ProblemReference } from '@/modules/courses/domain/value-objects';

@Injectable()
export class DetachProblemUseCase implements IDetachProblemPortIn {
  constructor(
    private readonly authorization: CourseAuthorizationService,
    @Inject(COURSE_REPOSITORY) private readonly repository: CourseRepository,
    @Inject(COURSE_TRANSACTION_RUNNER) private readonly transactionRunner: TransactionRunner,

    private readonly readiness: CoursePublishReadinessService,
  ) {}
  async execute(
    principal: Principal,
    courseId: string,
    chapterId: ChapterId,
    problemId: ProblemReference,
    now = new Date(),
  ): Promise<void> {
    this.authorization.requirePermission(principal, 'course:update');
    await this.transactionRunner.run(async () => {
      const course = await this.repository.loadForUpdate(courseId);
      if (!course) throw new CourseNotFoundError('Course not found');
      this.authorization.requireOwnership(principal, course.createdBy.value);
      course.removeProblemFromChapter(chapterId, problemId, now);
      if (course.isPublished) await this.readiness.assertReady(course);
      await this.repository.save(course);
    });
  }
}
