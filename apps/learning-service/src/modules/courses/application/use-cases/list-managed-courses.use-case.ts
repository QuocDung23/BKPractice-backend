import { Inject, Injectable } from '@nestjs/common';

import type { Principal } from '@/modules/courses/application/models';
import type { IListManagedCoursesPortIn } from '@/modules/courses/application/ports/in';
import type { ManagedCourseSummaryResult } from '@/modules/courses/application/results';
import {
  CourseAuthorizationService,
  CourseViewAssembler,
} from '@/modules/courses/application/services';
import { COURSE_REPOSITORY } from '@/modules/courses/course.tokens';
import type { CoursePage, CourseRepository } from '@/modules/courses/domain/repositories';

@Injectable()
export class ListManagedCoursesUseCase implements IListManagedCoursesPortIn {
  constructor(
    private readonly authorization: CourseAuthorizationService,
    private readonly views: CourseViewAssembler,
    @Inject(COURSE_REPOSITORY) private readonly repository: CourseRepository,
  ) {}

  async execute(
    principal: Principal,
    includeDeleted: boolean,
    page: number,
    limit: number,
    search?: string,
  ): Promise<CoursePage<ManagedCourseSummaryResult>> {
    this.authorization.requirePermission(principal, 'course:read-managed');
    const result = await this.repository.listManaged({
      createdBy: principal.roles.includes('ADMIN') ? undefined : principal.userId,
      includeDeleted,
      page,
      limit,
      search,
    });
    return { ...result, items: result.items.map((c) => this.views.toManagedSummary(c)) };
  }
}
