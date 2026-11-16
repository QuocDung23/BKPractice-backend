import type { TransactionRunner } from '@learning/modules/problems/application/ports/out/transaction-runner.port.out';

import type { Principal } from '@/modules/courses/application/models';
import type {
  CourseProblemCatalog,
  CourseQuizCatalog,
  CourseQuizSummary,
  ProblemSummary,
} from '@/modules/courses/application/ports/out';
import {
  CourseAuthorizationService,
  CoursePublishReadinessService,
  CourseViewAssembler,
} from '@/modules/courses/application/services';
import { Course } from '@/modules/courses/domain';
import type {
  CourseListFilter,
  CoursePage,
  CourseRepository,
  ManagedCourseListFilter,
} from '@/modules/courses/domain/repositories';
import { CourseReadiness } from '@/modules/courses/domain/services';
import {
  ChapterDescription,
  ChapterTitle,
  CourseDescription,
  CourseSlug,
  CourseTitle,
  CreatedBy,
  ProblemReference,
} from '@/modules/courses/domain/value-objects';

export const OWNER_ID = '00000000-0000-4000-8000-0000000000a1';

export const OTHER_ID = '00000000-0000-4000-8000-0000000000b2';

export const PROBLEM_ID = '00000000-0000-4000-8000-0000000000c3';

export const QUIZ_ID = '00000000-0000-4000-8000-0000000000d4';

export const ALL_COURSE_PERMISSIONS = [
  'course:create',
  'course:update',
  'course:publish',
  'course:hold',
  'course:republish',
  'course:delete',
  'course:restore',
  'course:read-managed',
] as const;

export function admin(userId = OWNER_ID): Principal {
  return { userId, roles: ['ADMIN'], permissions: ALL_COURSE_PERMISSIONS };
}

export function student(): Principal {
  return { userId: OTHER_ID, roles: ['STUDENT'], permissions: [] };
}

export function draftCourse(slug = 'intro-c', createdBy = OWNER_ID): Course {
  return Course.create({
    slug: new CourseSlug(slug),
    title: new CourseTitle('Intro C'),
    description: new CourseDescription(null),
    createdBy: new CreatedBy(createdBy),
  });
}

export function courseWithProblem(problemId = PROBLEM_ID, slug = 'intro-c'): Course {
  const course = draftCourse(slug);
  const chapterId = course.addChapter({
    title: new ChapterTitle('Chapter 1'),
    description: new ChapterDescription(null),
  });
  course.addProblemToChapter(chapterId, new ProblemReference(problemId));
  return course;
}

export function courseWithQuiz(quizId = QUIZ_ID, slug = 'intro-c'): Course {
  const course = draftCourse(slug);
  const chapterId = course.addChapter({
    title: new ChapterTitle('Chapter 1'),
    description: new ChapterDescription(null),
  });
  course.attachQuiz(chapterId, quizId);
  return course;
}

export class InMemoryCourseRepository implements CourseRepository {
  readonly store = new Map<string, Course>();
  saveCount = 0;
  hardDeleted: string[] = [];

  findById(id: string): Promise<Course | null> {
    const course = this.store.get(id);
    return Promise.resolve(course && !course.isDeleted ? clone(course) : null);
  }
  findByIdIncludingDeleted(id: string): Promise<Course | null> {
    const course = this.store.get(id);
    return Promise.resolve(course ? clone(course) : null);
  }
  findPublishedByIdOrSlug(idOrSlug: string): Promise<Course | null> {
    const found = [...this.store.values()].find(
      (c) =>
        (c.id.value === idOrSlug || c.slug.value === idOrSlug) && c.isPublished && !c.isDeleted,
    );
    return Promise.resolve(found ? clone(found) : null);
  }
  findManagedById(id: string, includeDeleted: boolean): Promise<Course | null> {
    const course = this.store.get(id);
    if (!course) return Promise.resolve(null);
    return Promise.resolve(course.isDeleted && !includeDeleted ? null : clone(course));
  }
  loadForUpdate(id: string, includeDeleted = false): Promise<Course | null> {
    return includeDeleted ? this.findByIdIncludingDeleted(id) : this.findById(id);
  }
  listPublished(filter: CourseListFilter): Promise<CoursePage<Course>> {
    const all = [...this.store.values()].filter((c) => c.isPublished && !c.isDeleted);
    return Promise.resolve(this.paginate(all, filter.page, filter.limit));
  }
  listManaged(filter: ManagedCourseListFilter): Promise<CoursePage<Course>> {
    const all = [...this.store.values()].filter(
      (c) =>
        (filter.includeDeleted || !c.isDeleted) &&
        (!filter.createdBy || c.createdBy.value === filter.createdBy) &&
        (!filter.search || c.title.value.toLowerCase().includes(filter.search.toLowerCase())),
    );
    return Promise.resolve(this.paginate(all, filter.page, filter.limit));
  }
  isSlugAvailable(slug: string, excludeCourseId?: string): Promise<boolean> {
    return Promise.resolve(
      ![...this.store.values()].some(
        (c) => c.slug.value === slug && c.id.value !== excludeCourseId,
      ),
    );
  }
  save(course: Course): Promise<void> {
    this.saveCount += 1;
    this.store.set(course.id.value, clone(course));
    return Promise.resolve();
  }
  hardDelete(id: string): Promise<boolean> {
    this.hardDeleted.push(id);
    return Promise.resolve(this.store.delete(id));
  }

  private paginate(items: Course[], page: number, limit: number): CoursePage<Course> {
    return {
      items: items.slice((page - 1) * limit, page * limit).map(clone),
      total: items.length,
      page,
      limit,
    };
  }
}

/** Giống DB: mỗi lần nạp là một bản sao, thay đổi chưa `save` không rò vào state đã lưu. */
function clone(course: Course): Course {
  return Course.rehydrate(course.toSnapshot());
}

export class FakeProblemCatalog implements CourseProblemCatalog {
  readonly problems = new Map<string, ProblemSummary>();

  setProblem(problemId: string, overrides: Partial<ProblemSummary> = {}): ProblemSummary {
    const problem: ProblemSummary = {
      id: problemId,
      slug: `slug-${problemId.slice(-4)}`,
      title: `Problem ${problemId.slice(-4)}`,
      problemType: 'STANDARD',
      difficulty: 'EASY',
      publishStatus: 'PUBLISHED',
      isDeleted: false,
      createdBy: OWNER_ID,
      ...overrides,
    };
    this.problems.set(problemId, problem);
    return problem;
  }

  findByIds(ids: readonly string[]): Promise<ReadonlyMap<string, ProblemSummary>> {
    const found = new Map<string, ProblemSummary>();
    for (const id of ids) {
      const problem = this.problems.get(id);
      if (problem) found.set(id, problem);
    }
    return Promise.resolve(found);
  }
}

export class FakeQuizCatalog implements CourseQuizCatalog {
  readonly quizzes = new Map<string, CourseQuizSummary>();

  setQuiz(quizId: string, overrides: Partial<CourseQuizSummary> = {}): CourseQuizSummary {
    const quiz: CourseQuizSummary = {
      id: quizId,
      title: `Quiz ${quizId.slice(-4)}`,
      status: 'PUBLISHED',
      deletedAt: null,
      createdBy: OWNER_ID,
      sharedWith: [],
      ...overrides,
    };
    this.quizzes.set(quizId, quiz);
    return quiz;
  }

  findByIds(ids: readonly string[]): Promise<Map<string, CourseQuizSummary>> {
    const found = new Map<string, CourseQuizSummary>();
    for (const id of ids) {
      const quiz = this.quizzes.get(id);
      if (quiz) found.set(id, quiz);
    }
    return Promise.resolve(found);
  }
}

export class InlineTransactionRunner implements TransactionRunner {
  run<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }
}

/** Dựng toàn bộ service application trên fake in-memory để test use case mà không cần Nest. */
export function createCourseTestKit() {
  const repository = new InMemoryCourseRepository();
  const catalog = new FakeProblemCatalog();
  const quizCatalog = new FakeQuizCatalog();
  const transactions = new InlineTransactionRunner();
  const authorization = new CourseAuthorizationService();
  const readiness = new CoursePublishReadinessService(new CourseReadiness(), catalog, quizCatalog);
  const views = new CourseViewAssembler(catalog, readiness, quizCatalog);
  return {
    repository,
    catalog,
    quizCatalog,
    transactions,
    authorization,
    readiness,
    views,
    seed(course: Course = courseWithProblem()): Course {
      repository.store.set(course.id.value, course);
      return course;
    },
    /** State đã lưu của một Course (bản sao mới nhất trong repository). */
    stored(course: Course): Course {
      const saved = repository.store.get(course.id.value);
      if (!saved) throw new Error('Course is not stored');
      return saved;
    },
  };
}
