import type { TransactionRunner } from '@learning/modules/problems/application/ports/out/transaction-runner.port.out';
import { Inject, Injectable } from '@nestjs/common';

import {
  CourseNotFoundError,
  ProblemNotAttachableError,
} from '@/modules/courses/application/errors';
import type { Principal } from '@/modules/courses/application/models';
import type { IAttachProblemPortIn } from '@/modules/courses/application/ports/in';
import type { CourseProblemCatalog } from '@/modules/courses/application/ports/out';
import type { ManagedCourseResult } from '@/modules/courses/application/results';
import {
  CourseAuthorizationService,
  CourseViewAssembler,
} from '@/modules/courses/application/services';
import {
  COURSE_PROBLEM_CATALOG,
  COURSE_REPOSITORY,
  COURSE_TRANSACTION_RUNNER,
} from '@/modules/courses/course.tokens';
import type { CourseRepository } from '@/modules/courses/domain/repositories';
import { ProblemAttachPolicy } from '@/modules/courses/domain/services';
import type { ChapterId, ProblemReference } from '@/modules/courses/domain/value-objects';

@Injectable()
export class AttachProblemUseCase implements IAttachProblemPortIn {
  private readonly attachPolicy = new ProblemAttachPolicy();
  constructor(
    private readonly authorization: CourseAuthorizationService,
    @Inject(COURSE_REPOSITORY) private readonly repository: CourseRepository,
    @Inject(COURSE_TRANSACTION_RUNNER) private readonly transactionRunner: TransactionRunner,
    private readonly views: CourseViewAssembler,
    @Inject(COURSE_PROBLEM_CATALOG) private readonly catalog: CourseProblemCatalog,
  ) {}
  async execute(
    principal: Principal,
    courseId: string,
    chapterId: ChapterId,
    problemId: ProblemReference,
    position?: number,
    now = new Date(),
  ): Promise<ManagedCourseResult> {
    this.authorization.requirePermission(principal, 'course:update');
    return this.transactionRunner.run(async () => {
      const course = await this.repository.loadForUpdate(courseId);
      if (!course) throw new CourseNotFoundError('Course not found');
      this.authorization.requireOwnership(principal, course.createdBy.value);
      const problem = (await this.catalog.findByIds([problemId.value])).get(problemId.value);
      // Không phân biệt "không tồn tại" với "không được phép" (SR-003, AC-008).
      const attachable = this.attachPolicy.isAttachable(
        problem && (principal.roles.includes('ADMIN') || problem.createdBy === principal.userId)
          ? {
              problemId: problem.id,
              publishStatus: problem.publishStatus,
              isDeleted: problem.isDeleted,
            }
          : undefined,
      );
      if (!attachable) throw new ProblemNotAttachableError('Problem is not attachable');
      course.addProblemToChapter(chapterId, problemId, now, position);
      await this.repository.save(course);
      return this.views.toManaged(course);
    });
  }
}
