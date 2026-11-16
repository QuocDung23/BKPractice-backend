import { Inject, Injectable } from '@nestjs/common';

import { CourseNotFoundError } from '@/modules/courses/application/errors';
import type { Principal } from '@/modules/courses/application/models';
import type { IGetManagedCoursePortIn } from '@/modules/courses/application/ports/in';
import type { ManagedCourseResult } from '@/modules/courses/application/results';
import {
  CourseAuthorizationService,
  CourseViewAssembler,
} from '@/modules/courses/application/services';
import { COURSE_REPOSITORY } from '@/modules/courses/course.tokens';
import type { CourseRepository } from '@/modules/courses/domain/repositories';

@Injectable()
export class GetManagedCourseUseCase implements IGetManagedCoursePortIn {
  constructor(
    private readonly authorization: CourseAuthorizationService,
    private readonly views: CourseViewAssembler,
    @Inject(COURSE_REPOSITORY) private readonly repository: CourseRepository,
  ) {}

  async execute(
    principal: Principal,
    courseId: string,
    includeDeleted: boolean,
  ): Promise<ManagedCourseResult> {
    this.authorization.requirePermission(principal, 'course:read-managed');
    const course = await this.repository.findManagedById(courseId, includeDeleted);
    if (!course) throw new CourseNotFoundError('Course not found');
    this.authorization.requireOwnership(principal, course.createdBy.value);
    return this.views.toManaged(course);
  }
}
