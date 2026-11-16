import type { Course } from '@/modules/courses/domain';

export interface CourseListFilter {
  readonly search?: string;
  readonly page: number;
  readonly limit: number;
}

export interface ManagedCourseListFilter {
  readonly createdBy?: string;
  readonly includeDeleted: boolean;
  readonly search?: string;
  readonly page: number;
  readonly limit: number;
}

export interface CoursePage<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

export interface CourseRepository {
  findById(id: string): Promise<Course | null>;
  findByIdIncludingDeleted(id: string): Promise<Course | null>;
  findPublishedByIdOrSlug(idOrSlug: string): Promise<Course | null>;
  findManagedById(id: string, includeDeleted: boolean): Promise<Course | null>;
  loadForUpdate(id: string, includeDeleted?: boolean): Promise<Course | null>;
  listPublished(filter: CourseListFilter): Promise<CoursePage<Course>>;
  listManaged(filter: ManagedCourseListFilter): Promise<CoursePage<Course>>;
  isSlugAvailable(slug: string, excludeCourseId?: string): Promise<boolean>;
  save(course: Course, expectedUpdatedAt?: Date): Promise<void>;
  hardDelete(id: string): Promise<boolean>;
}
