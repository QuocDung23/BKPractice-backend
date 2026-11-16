import {
  ChapterNotFound,
  DomainValidationError,
  InvalidCourseState,
  ProblemAlreadyInCourse,
} from '@/modules/courses/domain/errors';
import type {
  Chapter,
  ChapterTitle,
  CourseSlug,
  CourseStatus,
  CourseTitle,
  CreatedBy,
  ProblemReference,
} from '@/modules/courses/domain/value-objects';
import {
  ChapterDescription,
  ChapterId,
  CourseDescription,
  CourseId,
  DeletedMarker,
  assertValidDate,
} from '@/modules/courses/domain/value-objects';

export interface CourseSnapshot {
  readonly id: CourseId;
  readonly slug: CourseSlug;
  readonly title: CourseTitle;
  readonly description: CourseDescription;
  readonly status: CourseStatus;
  readonly deletedMarker: DeletedMarker;
  readonly chapters: readonly Chapter[];
  readonly createdBy: CreatedBy;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateCourseInput {
  readonly slug: CourseSlug;
  readonly title: CourseTitle;
  readonly description?: CourseDescription | null;
  readonly createdBy: CreatedBy;
}

export interface UpdateCourseInput {
  readonly title?: CourseTitle;
  readonly description?: CourseDescription;
}

export interface AddChapterInput {
  readonly title: ChapterTitle;
  readonly description?: ChapterDescription | null;
  /** Vị trí chèn (0..số Chapter hiện có); mặc định cuối danh sách. */
  readonly position?: number;
}

export interface UpdateChapterInput {
  readonly title?: ChapterTitle;
  readonly description?: ChapterDescription;
}

export interface CreateCourseOptions {
  readonly id?: CourseId;
  readonly now?: Date;
}

const MAX_CHAPTERS = 50;

const MAX_PROBLEMS_PER_CHAPTER = 50;

export class Course {
  private readonly _id: CourseId;
  private readonly _slug: CourseSlug;
  private readonly _createdBy: CreatedBy;
  private readonly _createdAt: Date;

  private _title: CourseTitle;
  private _description: CourseDescription;
  private _status: CourseStatus;
  private _deletedMarker: DeletedMarker;
  private _chapters: Chapter[];
  private _updatedAt: Date;

  private constructor(snapshot: CourseSnapshot) {
    this._id = snapshot.id;
    this._slug = snapshot.slug;
    this._title = snapshot.title;
    this._description = snapshot.description;
    this._status = snapshot.status;
    this._deletedMarker = snapshot.deletedMarker;
    this._chapters = snapshot.chapters.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      description: chapter.description,
      quizRefs: [...(chapter.quizRefs ?? [])],
      problemRefs: [...chapter.problemRefs],
    }));
    this._createdBy = snapshot.createdBy;
    this._createdAt = assertValidDate(snapshot.createdAt, 'createdAt');
    this._updatedAt = assertValidDate(snapshot.updatedAt, 'updatedAt');
  }

  static create(input: CreateCourseInput, options: CreateCourseOptions = {}): Course {
    const now = assertValidDate(options.now ?? new Date(), 'now');
    const snapshot: CourseSnapshot = {
      id: options.id ?? CourseId.generate(),
      slug: input.slug,
      title: input.title,
      description: input.description ?? new CourseDescription(null),
      status: 'DRAFT',
      deletedMarker: DeletedMarker.none(),
      chapters: [],
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    return new Course(snapshot);
  }

  static rehydrate(snapshot: CourseSnapshot): Course {
    return new Course(snapshot);
  }

  get id(): CourseId {
    return this._id;
  }
  get slug(): CourseSlug {
    return this._slug;
  }
  get title(): CourseTitle {
    return this._title;
  }
  get description(): CourseDescription {
    return this._description;
  }
  get status(): CourseStatus {
    return this._status;
  }
  get deletedMarker(): DeletedMarker {
    return this._deletedMarker;
  }
  get chapters(): readonly Chapter[] {
    return this._chapters;
  }
  get createdBy(): CreatedBy {
    return this._createdBy;
  }
  get createdAt(): Date {
    return this._createdAt;
  }
  get updatedAt(): Date {
    return this._updatedAt;
  }

  get isDraft(): boolean {
    return this._status === 'DRAFT' && !this._deletedMarker.isDeleted;
  }
  get isPublished(): boolean {
    return this._status === 'PUBLISHED' && !this._deletedMarker.isDeleted;
  }
  get isOnHold(): boolean {
    return this._status === 'ON_HOLD' && !this._deletedMarker.isDeleted;
  }
  get isDeleted(): boolean {
    return this._deletedMarker.isDeleted;
  }
  get isEditable(): boolean {
    return !this.isDeleted && (this._status === 'DRAFT' || this._status === 'PUBLISHED');
  }

  update(input: UpdateCourseInput, now: Date = new Date()): void {
    if (this.isDeleted)
      throw new InvalidCourseState('deleted', 'A deleted course cannot be updated');
    if (this.isOnHold) throw new InvalidCourseState('status', 'A course on hold cannot be updated');

    const updatedAt = assertValidDate(now, 'now');
    if (input.title !== undefined) this._title = input.title;
    if (input.description !== undefined) this._description = input.description;
    this._updatedAt = updatedAt;
  }

  addChapter(input: AddChapterInput, now: Date = new Date()): ChapterId {
    if (!this.isEditable) throw new InvalidCourseState('status', 'Course is not editable');
    if (this._chapters.length >= MAX_CHAPTERS) {
      throw new DomainValidationError(
        'chapters',
        `Course may have at most ${MAX_CHAPTERS} chapters`,
      );
    }
    const updatedAt = assertValidDate(now, 'now');
    const chapter: Chapter = {
      id: ChapterId.generate(),
      title: input.title,
      description: input.description ?? new ChapterDescription(null),
      problemRefs: [],
    };
    const position = resolvePosition(input.position, this._chapters.length, 'chapterPosition');
    this._chapters.splice(position, 0, chapter);
    this._updatedAt = updatedAt;
    return chapter.id;
  }

  updateChapter(chapterId: ChapterId, input: UpdateChapterInput, now: Date = new Date()): void {
    if (!this.isEditable) throw new InvalidCourseState('status', 'Course is not editable');
    const index = this._chapters.findIndex((c) => c.id.equals(chapterId));
    if (index < 0) throw new ChapterNotFound(chapterId.value);
    const updatedAt = assertValidDate(now, 'now');
    const current = this._chapters[index]!;
    this._chapters[index] = {
      id: current.id,
      title: input.title ?? current.title,
      description: input.description ?? current.description,
      problemRefs: [...current.problemRefs],
    };
    this._updatedAt = updatedAt;
  }

  removeChapter(chapterId: ChapterId, now: Date = new Date()): void {
    if (!this.isEditable) throw new InvalidCourseState('status', 'Course is not editable');
    const index = this._chapters.findIndex((c) => c.id.equals(chapterId));
    if (index < 0) throw new ChapterNotFound(chapterId.value);
    const updatedAt = assertValidDate(now, 'now');
    this._chapters.splice(index, 1);
    this._updatedAt = updatedAt;
  }

  reorderChapters(orderedIds: readonly ChapterId[], now: Date = new Date()): void {
    if (!this.isEditable) throw new InvalidCourseState('status', 'Course is not editable');
    if (orderedIds.length !== this._chapters.length) {
      throw new DomainValidationError('chapterOrder', 'Reorder must include all chapters');
    }
    const idSet = new Set(this._chapters.map((c) => c.id.value));
    for (const id of orderedIds) {
      if (!idSet.has(id.value))
        throw new DomainValidationError('chapterOrder', 'Unknown chapter in reorder');
    }
    if (new Set(orderedIds.map((i) => i.value)).size !== orderedIds.length) {
      throw new DomainValidationError('chapterOrder', 'Duplicate chapter in reorder');
    }
    const updatedAt = assertValidDate(now, 'now');
    const byId = new Map(this._chapters.map((c) => [c.id.value, c]));
    this._chapters = orderedIds.map((id) => byId.get(id.value)!);
    this._updatedAt = updatedAt;
  }

  addProblemToChapter(
    chapterId: ChapterId,
    problemId: ProblemReference,
    now: Date = new Date(),
    position?: number,
  ): void {
    if (!this.isEditable) throw new InvalidCourseState('status', 'Course is not editable');
    const chapterIndex = this._chapters.findIndex((c) => c.id.equals(chapterId));
    if (chapterIndex < 0) throw new ChapterNotFound(chapterId.value);
    const chapter = this._chapters[chapterIndex]!;
    if (chapter.problemRefs.length >= MAX_PROBLEMS_PER_CHAPTER) {
      throw new DomainValidationError(
        'problems',
        `Chapter may have at most ${MAX_PROBLEMS_PER_CHAPTER} problems`,
      );
    }
    // Mỗi Problem tối đa một lần trong cả Course (kể cả cùng Chapter).
    const allRefs = this._chapters.flatMap((c) => c.problemRefs);
    if (allRefs.some((p) => p.value === problemId.value)) {
      throw new ProblemAlreadyInCourse(problemId.value);
    }
    const updatedAt = assertValidDate(now, 'now');
    const newRefs = [...chapter.problemRefs];
    newRefs.splice(resolvePosition(position, newRefs.length, 'problemPosition'), 0, problemId);
    this._chapters[chapterIndex] = { ...chapter, problemRefs: newRefs };
    this._updatedAt = updatedAt;
  }

  removeProblemFromChapter(
    chapterId: ChapterId,
    problemId: ProblemReference,
    now: Date = new Date(),
  ): void {
    if (!this.isEditable) throw new InvalidCourseState('status', 'Course is not editable');
    const chapterIndex = this._chapters.findIndex((c) => c.id.equals(chapterId));
    if (chapterIndex < 0) throw new ChapterNotFound(chapterId.value);
    const chapter = this._chapters[chapterIndex]!;
    const refIndex = chapter.problemRefs.findIndex((p) => p.value === problemId.value);
    if (refIndex < 0) throw new DomainValidationError('problems', 'Problem not in chapter');
    const updatedAt = assertValidDate(now, 'now');
    const newRefs = [...chapter.problemRefs];
    newRefs.splice(refIndex, 1);
    this._chapters[chapterIndex] = { ...chapter, problemRefs: newRefs };
    this._updatedAt = updatedAt;
  }

  reorderProblemsInChapter(
    chapterId: ChapterId,
    orderedIds: readonly ProblemReference[],
    now: Date = new Date(),
  ): void {
    if (!this.isEditable) throw new InvalidCourseState('status', 'Course is not editable');
    const chapterIndex = this._chapters.findIndex((c) => c.id.equals(chapterId));
    if (chapterIndex < 0) throw new ChapterNotFound(chapterId.value);
    const chapter = this._chapters[chapterIndex]!;
    if (orderedIds.length !== chapter.problemRefs.length) {
      throw new DomainValidationError('problemOrder', 'Reorder must include all problems');
    }
    const idSet = new Set(chapter.problemRefs.map((p) => p.value));
    for (const id of orderedIds) {
      if (!idSet.has(id.value))
        throw new DomainValidationError('problemOrder', 'Unknown problem in reorder');
    }
    if (new Set(orderedIds.map((i) => i.value)).size !== orderedIds.length) {
      throw new DomainValidationError('problemOrder', 'Duplicate problem in reorder');
    }
    const updatedAt = assertValidDate(now, 'now');
    this._chapters[chapterIndex] = { ...chapter, problemRefs: [...orderedIds] };
    this._updatedAt = updatedAt;
  }

  publish(now: Date = new Date()): void {
    if (this.isDeleted)
      throw new InvalidCourseState('deleted', 'A deleted course cannot be published');
    if (this._status !== 'DRAFT')
      throw new InvalidCourseState('status', `Cannot publish a course with status ${this._status}`);
    const updatedAt = assertValidDate(now, 'now');
    this._status = 'PUBLISHED';
    this._updatedAt = updatedAt;
  }

  hold(now: Date = new Date()): void {
    if (this.isDeleted) throw new InvalidCourseState('deleted', 'A deleted course cannot be held');
    if (this._status !== 'PUBLISHED')
      throw new InvalidCourseState('status', `Cannot hold a course with status ${this._status}`);
    const updatedAt = assertValidDate(now, 'now');
    this._status = 'ON_HOLD';
    this._updatedAt = updatedAt;
  }

  republish(now: Date = new Date()): void {
    if (this.isDeleted)
      throw new InvalidCourseState('deleted', 'A deleted course cannot be republished');
    if (this._status !== 'ON_HOLD')
      throw new InvalidCourseState(
        'status',
        `Cannot republish a course with status ${this._status}`,
      );
    const updatedAt = assertValidDate(now, 'now');
    this._status = 'PUBLISHED';
    this._updatedAt = updatedAt;
  }

  softDelete(now: Date = new Date()): void {
    if (this.isDeleted) throw new InvalidCourseState('deleted', 'The course is already deleted');
    if (this._status !== 'PUBLISHED' && this._status !== 'ON_HOLD') {
      throw new InvalidCourseState('status', 'Only a published or on-hold course can be deleted');
    }
    const deletedAt = assertValidDate(now, 'now');
    this._deletedMarker = DeletedMarker.at(deletedAt);
    this._updatedAt = deletedAt;
  }

  restore(now: Date = new Date()): void {
    if (!this.isDeleted) throw new InvalidCourseState('deleted', 'The course is not deleted');
    const updatedAt = assertValidDate(now, 'now');
    this._deletedMarker = DeletedMarker.none();
    this._updatedAt = updatedAt;
  }

  attachQuiz(chapterId: ChapterId, quizId: string, position?: number): void {
    this.assertQuizEditable();
    const index = this._chapters.findIndex((c) => c.id.value === chapterId.value);
    if (index < 0) throw new ChapterNotFound(chapterId.value);
    const chapter = this._chapters[index]!;
    const ids = [...(chapter.quizRefs ?? [])];
    if (ids.includes(quizId) || ids.length >= 50)
      throw new DomainValidationError('quizId', 'Duplicate Quiz or Chapter limit reached');
    ids.splice(resolvePosition(position, ids.length, 'position'), 0, quizId);
    this._chapters[index] = { ...chapter, quizRefs: ids };
    this._updatedAt = new Date();
  }
  detachQuiz(chapterId: ChapterId, quizId: string): void {
    this.assertQuizEditable();
    const index = this._chapters.findIndex((c) => c.id.value === chapterId.value);
    if (index < 0) throw new ChapterNotFound(chapterId.value);
    const chapter = this._chapters[index]!;
    this._chapters[index] = {
      ...chapter,
      quizRefs: (chapter.quizRefs ?? []).filter((id) => id !== quizId),
    };
    this._updatedAt = new Date();
  }
  reorderQuizzes(chapterId: ChapterId, ids: string[]): void {
    this.assertQuizEditable();
    const index = this._chapters.findIndex((c) => c.id.value === chapterId.value);
    if (index < 0) throw new ChapterNotFound(chapterId.value);
    const chapter = this._chapters[index]!;
    const old = chapter.quizRefs ?? [];
    if (
      ids.length !== old.length ||
      new Set(ids).size !== old.length ||
      ids.some((id) => !old.includes(id))
    )
      throw new DomainValidationError('ids', 'Order must contain exactly the current Quiz ids');
    this._chapters[index] = { ...chapter, quizRefs: [...ids] };
    this._updatedAt = new Date();
  }
  private assertQuizEditable(): void {
    if (!this.isEditable) throw new InvalidCourseState('status', 'Course is not editable');
  }
  toSnapshot(): CourseSnapshot {
    return {
      id: this._id,
      slug: this._slug,
      title: this._title,
      description: this._description,
      status: this._status,
      deletedMarker: this._deletedMarker,
      chapters: this._chapters.map((chapter) => ({
        id: chapter.id,
        title: chapter.title,
        description: chapter.description,
        quizRefs: [...(chapter.quizRefs ?? [])],
        problemRefs: [...chapter.problemRefs],
      })),
      createdBy: this._createdBy,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
    };
  }
}

export type { CourseSnapshot as CourseSnapshotType };

function resolvePosition(position: number | undefined, length: number, field: string): number {
  if (position === undefined) return length;
  if (!Number.isInteger(position) || position < 0 || position > length) {
    throw new DomainValidationError(field, `${field} must be an integer between 0 and ${length}`);
  }
  return position;
}
