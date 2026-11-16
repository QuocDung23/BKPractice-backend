import { Inject, Injectable } from '@nestjs/common';

import { CourseNotFoundError } from '@/modules/courses/application/errors';
import type { Principal } from '@/modules/courses/application/models';
import type { IAttachQuizPortIn } from '@/modules/courses/application/ports/in/attach-quiz.port.in';
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
export class AttachQuizUseCase implements IAttachQuizPortIn {
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
    quizId: string,
    position?: number,
  ): Promise<ManagedCourseResult> {
    this.authorization.requirePermission(p, 'course:update');
    return this.tx.run(async () => {
      const course = await this.repository.loadForUpdate(courseId);
      if (!course) throw new CourseNotFoundError('Course not found');
      this.authorization.requireOwner(p, course.createdBy.value);
      const found = (await this.catalog.findByIds([quizId])).get(quizId);
      if (
        !found ||
        found.deletedAt ||
        found.status !== 'PUBLISHED' ||
        (!p.roles.includes('ADMIN') &&
          found.createdBy !== p.userId &&
          !found.sharedWith.includes(p.userId))
      )
        throw new CourseNotFoundError('Quiz not available');
      course.attachQuiz(ChapterId.from(chapterId), quizId, position);
      await this.repository.save(course);
      return this.views.toManaged(course);
    });
  }
}
