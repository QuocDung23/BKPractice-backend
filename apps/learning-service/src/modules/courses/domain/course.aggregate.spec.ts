import { Course } from '@/modules/courses/domain/course.aggregate';
import {
  ChapterNotFound,
  DomainValidationError,
  ProblemAlreadyInCourse,
} from '@/modules/courses/domain/errors';
import {
  ChapterDescription,
  ChapterTitle,
  CourseDescription,
  CourseSlug,
  CourseTitle,
  ChapterId,
  CreatedBy,
  ProblemReference,
} from '@/modules/courses/domain/value-objects';

describe('Course aggregate', () => {
  const createdBy = new CreatedBy('00000000-0000-4000-8000-000000000031');

  it('creates a draft course', () => {
    const course = Course.create({
      slug: new CourseSlug('intro-c'),
      title: new CourseTitle('Intro C'),
      description: new CourseDescription(null),
      createdBy,
    });

    expect(course.status).toBe('DRAFT');
    expect(course.chapters).toHaveLength(0);
    expect(course.isEditable).toBe(true);
  });

  it('enforces chapter limit', () => {
    const course = Course.create({
      slug: new CourseSlug('c'),
      title: new CourseTitle('C'),
      description: new CourseDescription(null),
      createdBy,
    });

    for (let i = 0; i < 50; i += 1) {
      course.addChapter({
        title: new ChapterTitle(`Ch ${i}`),
        description: new ChapterDescription(null),
      });
    }

    expect(() =>
      course.addChapter({
        title: new ChapterTitle('Ch 51'),
        description: new ChapterDescription(null),
      }),
    ).toThrow();
  });

  it('prevents duplicate problem across course', () => {
    const course = Course.create({
      slug: new CourseSlug('c2'),
      title: new CourseTitle('C2'),
      description: new CourseDescription(null),
      createdBy,
    });
    const chapterId = course.addChapter({
      title: new ChapterTitle('Ch'),
      description: new ChapterDescription(null),
    });
    const problem = new ProblemReference('00000000-0000-4000-8000-000000000001');

    course.addProblemToChapter(chapterId, problem);

    expect(() => course.addProblemToChapter(chapterId, problem)).toThrow(ProblemAlreadyInCourse);
  });

  it('rejects a problem already attached to another chapter with a typed error', () => {
    const course = Course.create({
      slug: new CourseSlug('c2b'),
      title: new CourseTitle('C2b'),
      description: new CourseDescription(null),
      createdBy,
    });
    const first = course.addChapter({
      title: new ChapterTitle('One'),
      description: new ChapterDescription(null),
    });
    const second = course.addChapter({
      title: new ChapterTitle('Two'),
      description: new ChapterDescription(null),
    });
    const problem = new ProblemReference('00000000-0000-4000-8000-000000000001');
    course.addProblemToChapter(first, problem);

    expect(() => course.addProblemToChapter(second, problem)).toThrow(ProblemAlreadyInCourse);
    expect(course.chapters[1]!.problemRefs).toHaveLength(0);
  });

  it('publish transitions draft to published at aggregate level (readiness checked by caller)', () => {
    const course = Course.create({
      slug: new CourseSlug('c3'),
      title: new CourseTitle('C3'),
      description: new CourseDescription(null),
      createdBy,
    });

    course.publish();
    expect(course.status).toBe('PUBLISHED');
  });

  describe('positions and unknown chapters', () => {
    const newCourse = () =>
      Course.create({
        slug: new CourseSlug('pos'),
        title: new CourseTitle('Pos'),
        description: new CourseDescription(null),
        createdBy,
      });
    const titleOf = (c: Course) => c.chapters.map((chapter) => chapter.title.value);

    it('inserts chapters at a position and defaults to the end', () => {
      const course = newCourse();
      const add = (title: string, position?: number) =>
        course.addChapter({
          title: new ChapterTitle(title),
          description: new ChapterDescription(null),
          position,
        });

      add('b');
      add('c');
      add('a', 0);
      add('x', 3);

      expect(titleOf(course)).toEqual(['a', 'b', 'c', 'x']);
    });

    it.each([-1, 1.5, 99])('rejects chapter position %s', (position) => {
      const course = newCourse();

      expect(() =>
        course.addChapter({
          title: new ChapterTitle('a'),
          description: new ChapterDescription(null),
          position,
        }),
      ).toThrow(DomainValidationError);
      expect(course.chapters).toHaveLength(0);
    });

    it('inserts a problem at a position and rejects an invalid one', () => {
      const course = newCourse();
      const chapterId = course.addChapter({
        title: new ChapterTitle('a'),
        description: new ChapterDescription(null),
      });
      const p = (n: number) => new ProblemReference(`00000000-0000-4000-8000-00000000000${n}`);

      course.addProblemToChapter(chapterId, p(1));
      course.addProblemToChapter(chapterId, p(2));
      course.addProblemToChapter(chapterId, p(3), new Date(), 1);

      expect(course.chapters[0]!.problemRefs.map((r) => r.value.slice(-1))).toEqual([
        '1',
        '3',
        '2',
      ]);
      expect(() => course.addProblemToChapter(chapterId, p(4), new Date(), 9)).toThrow(
        DomainValidationError,
      );
    });

    it('throws the typed ChapterNotFound for every chapter operation', () => {
      const course = newCourse();
      const ghost = ChapterId.from('00000000-0000-4000-8000-0000000000aa');
      const problem = new ProblemReference('00000000-0000-4000-8000-000000000001');

      expect(() => course.updateChapter(ghost, {})).toThrow(ChapterNotFound);
      expect(() => course.removeChapter(ghost)).toThrow(ChapterNotFound);
      expect(() => course.addProblemToChapter(ghost, problem)).toThrow(ChapterNotFound);
      expect(() => course.removeProblemFromChapter(ghost, problem)).toThrow(ChapterNotFound);
      expect(() => course.reorderProblemsInChapter(ghost, [problem])).toThrow(ChapterNotFound);
    });
  });
  it('keeps Quiz order separate, permits reuse across chapters and enforces 50 per chapter', () => {
    const course = Course.create({
      slug: new CourseSlug('quiz-course'),
      title: new CourseTitle('Quiz course'),
      description: new CourseDescription(null),
      createdBy,
    });
    const first = course.addChapter({
      title: new ChapterTitle('First'),
      description: new ChapterDescription(null),
    });
    const second = course.addChapter({
      title: new ChapterTitle('Second'),
      description: new ChapterDescription(null),
    });
    const ids = Array.from(
      { length: 50 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );
    ids.forEach((id) => course.attachQuiz(first, id));
    expect(() => course.attachQuiz(first, ids[0]!)).toThrow(DomainValidationError);
    expect(() => course.attachQuiz(first, '00000000-0000-4000-8000-000000009999')).toThrow(
      DomainValidationError,
    );
    expect(() => course.attachQuiz(second, ids[0]!)).not.toThrow();
    expect(() => course.reorderQuizzes(first, ids.slice(1))).toThrow(DomainValidationError);
    course.reorderQuizzes(first, [...ids].reverse());
    const snapshot = course.toSnapshot();
    expect(Course.rehydrate(snapshot).chapters[0]!.quizRefs).toEqual([...ids].reverse());
    expect(course.chapters[0]!.problemRefs).toEqual([]);
    course.detachQuiz(first, ids[0]!);
    expect(course.chapters[0]!.quizRefs).toHaveLength(49);
    expect(course.chapters[1]!.quizRefs).toEqual([ids[0]]);
  });
});
