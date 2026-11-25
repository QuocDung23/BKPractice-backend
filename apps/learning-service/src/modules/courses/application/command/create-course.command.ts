import type {
  CourseSlug,
  CourseTitle,
  CourseDescription,
} from '@/modules/courses/domain/value-objects';

export interface CreateCourseCommand {
  readonly slug?: CourseSlug;
  readonly title: CourseTitle;
  readonly description: CourseDescription | null;
}
