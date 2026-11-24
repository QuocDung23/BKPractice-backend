import {
  createSlugBase,
  createSlugCandidate,
  SLUG_ATTEMPTS,
} from '@learning/application/slug-generation';
import type { TransactionRunner } from '@learning/modules/problems/application/ports/out/transaction-runner.port.out';
import { Inject, Injectable } from '@nestjs/common';

import type { CreateCourseCommand } from '@/modules/courses/application/command';
import { DuplicateCourseSlugError } from '@/modules/courses/application/errors';
import type { Principal } from '@/modules/courses/application/models';
import type { ICreateCoursePortIn } from '@/modules/courses/application/ports/in';
import type { ManagedCourseResult } from '@/modules/courses/application/results';
import {
  CourseAuthorizationService,
  CourseViewAssembler,
} from '@/modules/courses/application/services';
import { COURSE_REPOSITORY, COURSE_TRANSACTION_RUNNER } from '@/modules/courses/course.tokens';
import { Course } from '@/modules/courses/domain';
import { DomainValidationError } from '@/modules/courses/domain/errors';
import type { CourseRepository } from '@/modules/courses/domain/repositories';
import { CourseSlug, CreatedBy } from '@/modules/courses/domain/value-objects';

@Injectable()
export class CreateCourseUseCase implements ICreateCoursePortIn {
  constructor(
    private readonly authorization: CourseAuthorizationService,
    private readonly views: CourseViewAssembler,
    @Inject(COURSE_REPOSITORY) private readonly repository: CourseRepository,
    @Inject(COURSE_TRANSACTION_RUNNER) private readonly transactionRunner: TransactionRunner,
  ) {}

  async execute(principal: Principal, command: CreateCourseCommand): Promise<ManagedCourseResult> {
    this.authorization.requirePermission(principal, 'course:create');
    const requestedSlug = command.slug;
    if (requestedSlug?.value.toLowerCase() === 'managed') {
      throw new DomainValidationError('slug', 'This slug is reserved for course management');
    }
    const base = createSlugBase(command.title.value, 'hoc-phan');
    const firstCandidate = base === 'managed' ? 1 : 0;

    for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt += 1) {
      const slug =
        requestedSlug ?? new CourseSlug(createSlugCandidate(base, firstCandidate + attempt));
      const created = Course.create({
        slug,
        title: command.title,
        description: command.description,
        createdBy: new CreatedBy(principal.userId),
      });
      try {
        await this.transactionRunner.run(async () => {
          if (!(await this.repository.isSlugAvailable(slug.value))) {
            throw new DuplicateCourseSlugError('Course slug is already in use');
          }
          await this.repository.save(created);
        });
      } catch (error) {
        if (requestedSlug || !(error instanceof DuplicateCourseSlugError)) throw error;
        continue;
      }
      return this.views.toManaged(created);
    }
    throw new DuplicateCourseSlugError('Could not allocate a course slug');
  }
}
