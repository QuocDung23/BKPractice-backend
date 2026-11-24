import type {
  CreateCourseCommand,
  UpdateCourseCommand,
} from '@/modules/courses/application/command';
import { CourseDescription, CourseSlug, CourseTitle } from '@/modules/courses/domain/value-objects';
import type {
  CreateCourseRequestDto,
  UpdateCourseRequestDto,
} from '@/modules/courses/presentation/http/dto';

export class CourseRequestMapper {
  static toCreateCommand(body: CreateCourseRequestDto): CreateCourseCommand {
    return {
      ...(body.slug === undefined ? {} : { slug: new CourseSlug(body.slug) }),
      title: new CourseTitle(body.title),
      description: new CourseDescription(body.description ?? null),
    };
  }
  static toUpdateCommand(body: UpdateCourseRequestDto): UpdateCourseCommand {
    return {
      title: body.title === undefined ? undefined : new CourseTitle(body.title),
      description:
        body.description === undefined ? undefined : new CourseDescription(body.description),
    };
  }
}
