import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { In, QueryFailedError, Repository } from 'typeorm';

import {
  DuplicateCourseSlugError,
  ProblemNotAttachableError,
} from '@/modules/courses/application/errors';
import { Course as CourseAggregate } from '@/modules/courses/domain';
import { ProblemAlreadyInCourse } from '@/modules/courses/domain/errors';
import type {
  CourseListFilter,
  CoursePage,
  CourseRepository,
  ManagedCourseListFilter,
} from '@/modules/courses/domain/repositories';
import {
  ChapterEntity,
  ChapterProblemEntity,
  ChapterQuizEntity,
  CourseEntity,
} from '@/modules/courses/entities';
import { CoursePersistenceMapper } from '@/modules/courses/infrastructure/persistence/course.persistence-mapper';
import { CourseTypeOrmTransactionContext } from '@/modules/courses/infrastructure/persistence/course.typeorm-transaction-context';

@Injectable()
export class CourseTypeOrmRepository implements CourseRepository {
  constructor(private readonly context: CourseTypeOrmTransactionContext) {}

  private get courseRepo(): Repository<CourseEntity> {
    return this.context.getManager().getRepository(CourseEntity);
  }
  private get chapterRepo(): Repository<ChapterEntity> {
    return this.context.getManager().getRepository(ChapterEntity);
  }
  private get chapterProblemRepo(): Repository<ChapterProblemEntity> {
    return this.context.getManager().getRepository(ChapterProblemEntity);
  }

  private async loadAggregate(courseId: string): Promise<CourseAggregate | null> {
    const entity = await this.courseRepo.findOne({ where: { id: courseId } });
    if (!entity) return null;
    const chapters = await this.chapterRepo.find({ where: { courseId } });
    const chapterIds = chapters.map((c) => c.id);
    const chapterProblems = chapterIds.length
      ? await this.chapterProblemRepo
          .createQueryBuilder('cp')
          .where('cp.chapter_id IN (:...ids)', { ids: chapterIds })
          .getMany()
      : [];
    const quizzes = chapterIds.length
      ? await this.context
          .getManager()
          .getRepository(ChapterQuizEntity)
          .findBy({ chapterId: In(chapterIds) })
      : [];
    return CoursePersistenceMapper.toDomain(entity, chapters, chapterProblems, quizzes);
  }

  async findById(id: string): Promise<CourseAggregate | null> {
    const course = await this.loadAggregate(id);
    if (!course || course.deletedMarker.isDeleted) return null;
    return course;
  }

  async findByIdIncludingDeleted(id: string): Promise<CourseAggregate | null> {
    return this.loadAggregate(id);
  }

  async findPublishedByIdOrSlug(idOrSlug: string): Promise<CourseAggregate | null> {
    // `id` là uuid còn `slug` là varchar: dùng hai tham số riêng (một tham số dùng chung làm Postgres
    // suy kiểu sai) và chỉ thử `id` khi chuỗi đúng dạng UUID (tránh lỗi cast).
    const matcher = isUUID(idOrSlug) ? '(c.id = :id OR c.slug = :slug)' : 'c.slug = :slug';
    const entity = await this.courseRepo
      .createQueryBuilder('c')
      .where(`${matcher} AND c.status = :s AND c.deleted_at IS NULL`, {
        id: idOrSlug,
        slug: idOrSlug,
        s: 'PUBLISHED',
      })
      .getOne();
    if (!entity) return null;
    return this.loadAggregate(entity.id);
  }

  async findManagedById(id: string, includeDeleted: boolean): Promise<CourseAggregate | null> {
    const entity = await this.courseRepo.findOne({ where: { id } });
    if (!entity) return null;
    if (entity.deletedAt !== null && !includeDeleted) return null;
    return this.loadAggregate(id);
  }

  async loadForUpdate(id: string, includeDeleted = false): Promise<CourseAggregate | null> {
    // Khoá dòng course để các ghi đồng thời trên cùng Course được tuần tự hoá (plan: SELECT ... FOR UPDATE).
    const locked = await this.context
      .requireManager()
      .createQueryBuilder(CourseEntity, 'c')
      .select('c.id', 'id')
      .where('c.id = :id', { id })
      .setLock('pessimistic_write')
      .getRawOne<{ id: string }>();
    if (locked === undefined) return null;
    return includeDeleted ? this.findByIdIncludingDeleted(id) : this.findById(id);
  }

  async listPublished(filter: CourseListFilter): Promise<CoursePage<CourseAggregate>> {
    const qb = this.courseRepo
      .createQueryBuilder('c')
      .where('c.status = :s AND c.deleted_at IS NULL', { s: 'PUBLISHED' });
    if (filter.search) qb.andWhere('c.title ILIKE :q', { q: `%${escapeLike(filter.search)}%` });
    const total = await qb.getCount();
    const entities = await qb
      .orderBy('c.created_at', 'DESC')
      .skip((filter.page - 1) * filter.limit)
      .take(filter.limit)
      .getMany();
    const items = await Promise.all(entities.map((e) => this.loadAggregate(e.id)));
    return {
      items: items.filter((x): x is CourseAggregate => x !== null),
      total,
      page: filter.page,
      limit: filter.limit,
    };
  }

  async listManaged(filter: ManagedCourseListFilter): Promise<CoursePage<CourseAggregate>> {
    const qb = this.courseRepo.createQueryBuilder('c');
    if (filter.createdBy) qb.andWhere('c.created_by = :owner', { owner: filter.createdBy });
    if (!filter.includeDeleted) qb.andWhere('c.deleted_at IS NULL');
    if (filter.search) qb.andWhere('c.title ILIKE :q', { q: `%${escapeLike(filter.search)}%` });
    const total = await qb.getCount();
    const entities = await qb
      .orderBy('c.created_at', 'DESC')
      .skip((filter.page - 1) * filter.limit)
      .take(filter.limit)
      .getMany();
    const items = await Promise.all(entities.map((e) => this.loadAggregate(e.id)));
    return {
      items: items.filter((x): x is CourseAggregate => x !== null),
      total,
      page: filter.page,
      limit: filter.limit,
    };
  }

  async isSlugAvailable(slug: string, excludeCourseId?: string): Promise<boolean> {
    const qb = this.courseRepo.createQueryBuilder('c').where('c.slug = :slug', { slug });
    if (excludeCourseId) qb.andWhere('c.id <> :id', { id: excludeCourseId });
    const count = await qb.getCount();
    return count === 0;
  }

  async save(course: CourseAggregate, _expectedUpdatedAt?: Date): Promise<void> {
    const manager = this.context.requireManager();
    const courseRepo = manager.getRepository(CourseEntity);
    const chapterRepo = manager.getRepository(ChapterEntity);
    const chapterProblemRepo = manager.getRepository(ChapterProblemEntity);
    const courseId = course.id.value;

    try {
      await courseRepo.save(CoursePersistenceMapper.toEntity(course));

      const existingChapters = await chapterRepo.find({ where: { courseId } });
      const existingProblems = await chapterProblemRepo.find({ where: { courseId } });
      const keptChapterIds = new Set(course.chapters.map((c) => c.id.value));

      // Xoá trước, ghi sau, để UNIQUE (course_id, problem_id) không bị chạm bởi dòng sắp bị gỡ.
      for (const chapter of existingChapters) {
        if (!keptChapterIds.has(chapter.id)) await chapterRepo.delete(chapter.id); // cascade tới chapter_problems
      }
      const wanted = new Set(
        course.chapters.flatMap((c) => c.problemRefs.map((p) => `${c.id.value}:${p.value}`)),
      );
      for (const row of existingProblems) {
        if (keptChapterIds.has(row.chapterId) && !wanted.has(`${row.chapterId}:${row.problemId}`)) {
          await chapterProblemRepo.delete(row.id);
        }
      }

      for (const [chapterIndex, chapter] of course.chapters.entries()) {
        const chapterEntity =
          existingChapters.find((e) => e.id === chapter.id.value) ?? new ChapterEntity();
        chapterEntity.id = chapter.id.value;
        chapterEntity.courseId = courseId;
        chapterEntity.title = chapter.title.value;
        chapterEntity.description = chapter.description.value;
        chapterEntity.displayOrder = chapterIndex;
        await chapterRepo.save(chapterEntity);

        await manager.getRepository(ChapterQuizEntity).delete({ chapterId: chapter.id.value });
        if (chapter.quizRefs?.length)
          await manager.getRepository(ChapterQuizEntity).insert(
            chapter.quizRefs.map((quizId, displayOrder) => ({
              id: randomUUID(),
              chapterId: chapter.id.value,
              quizId,
              displayOrder,
            })),
          );
        for (const [problemIndex, ref] of chapter.problemRefs.entries()) {
          const row =
            existingProblems.find(
              (p) => p.chapterId === chapter.id.value && p.problemId === ref.value,
            ) ?? new ChapterProblemEntity();
          row.chapterId = chapter.id.value;
          row.courseId = courseId;
          row.problemId = ref.value;
          row.displayOrder = problemIndex;
          await chapterProblemRepo.save(row);
        }
      }
      await manager.query(
        `INSERT INTO course_problem_history (course_id, problem_id)
        SELECT DISTINCT course_id, problem_id FROM chapter_problems WHERE course_id = $1
        ON CONFLICT DO NOTHING`,
        [courseId],
      );
    } catch (error) {
      throw translatePersistenceError(error);
    }
  }

  async hardDelete(id: string): Promise<boolean> {
    const result = await this.context.requireManager().getRepository(CourseEntity).delete({ id });
    return (result.affected ?? 0) > 0;
  }
}

const UNIQUE_VIOLATION = '23505';

const FOREIGN_KEY_VIOLATION = '23503';

const PROBLEM_UNIQUE_CONSTRAINT = 'UQ_chapter_problems_course_problem';

const PROBLEM_FOREIGN_KEY = 'FK_chapter_problems_problem';

/** Ánh xạ vi phạm ràng buộc DB sang lỗi nghiệp vụ (plan: DuplicateSlug, ProblemAlreadyInCourse). */
function translatePersistenceError(error: unknown): unknown {
  if (!(error instanceof QueryFailedError)) return error;
  const driver = error.driverError as { code?: string; constraint?: string };
  if (driver.code === UNIQUE_VIOLATION) {
    return driver.constraint === PROBLEM_UNIQUE_CONSTRAINT
      ? new ProblemAlreadyInCourse('unknown')
      : new DuplicateCourseSlugError('Course slug is already in use');
  }
  if (driver.code === FOREIGN_KEY_VIOLATION && driver.constraint === PROBLEM_FOREIGN_KEY) {
    return new ProblemNotAttachableError('Problem is not attachable');
  }
  return error;
}

/** Không để `%`/`_` do người dùng nhập trở thành ký tự đại diện của ILIKE. */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, '\\$&');
}
