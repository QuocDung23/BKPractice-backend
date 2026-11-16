import {
  CourseNotFoundError,
  CourseNotReadyError,
  ForbiddenError,
} from '@/modules/courses/application/errors';
import {
  DeleteCourseUseCase,
  DetachQuizUseCase,
  HoldCourseUseCase,
  PublishCourseUseCase,
  RepublishCourseUseCase,
  RestoreCourseUseCase,
} from '@/modules/courses/application/use-cases';
import { InvalidCourseState } from '@/modules/courses/domain/errors';
import {
  courseWithProblem,
  courseWithQuiz,
  createCourseTestKit,
  draftCourse,
  admin,
  OTHER_ID,
  PROBLEM_ID,
  QUIZ_ID,
  student,
} from '@/modules/courses/testing';

describe('Course lifecycle use cases', () => {
  let kit: ReturnType<typeof createCourseTestKit>;

  beforeEach(() => {
    kit = createCourseTestKit();
  });

  const publish = () =>
    new PublishCourseUseCase(
      kit.authorization,
      kit.repository,
      kit.transactions,
      kit.views,
      kit.readiness,
    );
  const hold = () =>
    new HoldCourseUseCase(kit.authorization, kit.repository, kit.transactions, kit.views);
  const republish = () =>
    new RepublishCourseUseCase(
      kit.authorization,
      kit.repository,
      kit.transactions,
      kit.views,
      kit.readiness,
    );
  const restore = () =>
    new RestoreCourseUseCase(kit.authorization, kit.repository, kit.transactions, kit.views);
  const remove = () => new DeleteCourseUseCase(kit.authorization, kit.repository, kit.transactions);

  describe('PublishCourseUseCase', () => {
    it('publishes a course that has a published problem and reports it ready', async () => {
      kit.catalog.setProblem(PROBLEM_ID);
      const course = kit.seed();

      const result = await publish().execute(admin(), course.id.value);

      expect(result.status).toBe('PUBLISHED');
      expect(result.readiness).toEqual({ ready: true, issues: [] });
      expect(kit.repository.saveCount).toBe(1);
    });

    it('publishes a course that has only a published Quiz', async () => {
      kit.quizCatalog.setQuiz(QUIZ_ID);
      const course = kit.seed(courseWithQuiz());

      await expect(publish().execute(admin(), course.id.value)).resolves.toMatchObject({
        status: 'PUBLISHED',
        readiness: { ready: true, issues: [] },
      });
    });

    it('publishes a mixed course when either linked content type remains available', async () => {
      kit.catalog.setProblem(PROBLEM_ID, { publishStatus: 'ON_HOLD' });
      kit.quizCatalog.setQuiz(QUIZ_ID);
      const course = courseWithProblem();
      course.attachQuiz(course.chapters[0]!.id, QUIZ_ID);
      kit.seed(course);

      await expect(publish().execute(admin(), course.id.value)).resolves.toMatchObject({
        status: 'PUBLISHED',
      });
    });

    it.each([
      ['DRAFT', false],
      ['ON_HOLD', false],
      ['PUBLISHED', true],
    ] as const)(
      'rejects publish when the only problem is %s / deleted=%s (AC-006)',
      async (publishStatus, isDeleted) => {
        kit.catalog.setProblem(PROBLEM_ID, { publishStatus, isDeleted });
        const course = kit.seed();

        await expect(publish().execute(admin(), course.id.value)).rejects.toMatchObject({
          issues: ['PUBLISHED_CONTENT_REQUIRED'],
        });
        expect(course.status).toBe('DRAFT');
        expect(kit.repository.saveCount).toBe(0);
      },
    );

    it('rejects publish when a referenced problem no longer exists', async () => {
      const course = kit.seed();

      await expect(publish().execute(admin(), course.id.value)).rejects.toBeInstanceOf(
        CourseNotReadyError,
      );
    });

    it('rejects publish of a course without chapters', async () => {
      const course = kit.seed(draftCourse());

      const error = await publish()
        .execute(admin(), course.id.value)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(CourseNotReadyError);
      expect((error as CourseNotReadyError).issues).toContain('CHAPTER_REQUIRED');
    });

    it('requires the ADMIN role and course:publish permission (AC-002)', async () => {
      const course = kit.seed();

      await expect(publish().execute(student(), course.id.value)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      await expect(
        publish().execute({ ...admin(), permissions: ['course:create'] }, course.id.value),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('lets another ADMIN publish a course', async () => {
      kit.catalog.setProblem(PROBLEM_ID);
      const course = kit.seed();

      await expect(publish().execute(admin(OTHER_ID), course.id.value)).resolves.toMatchObject({
        status: 'PUBLISHED',
      });
    });

    it('reports a missing course as not found', async () => {
      await expect(
        publish().execute(admin(), '00000000-0000-4000-8000-0000000000ff'),
      ).rejects.toBeInstanceOf(CourseNotFoundError);
    });
  });

  describe('HoldCourseUseCase / RepublishCourseUseCase', () => {
    it('holds a published course and republishes it when still ready', async () => {
      kit.catalog.setProblem(PROBLEM_ID);
      const course = kit.seed();
      course.publish();

      expect((await hold().execute(admin(), course.id.value)).status).toBe('ON_HOLD');
      expect((await republish().execute(admin(), course.id.value)).status).toBe('PUBLISHED');
    });

    it('blocks republish when the problem was held in the meantime', async () => {
      kit.catalog.setProblem(PROBLEM_ID);
      const course = kit.seed();
      course.publish();
      await hold().execute(admin(), course.id.value);
      kit.catalog.setProblem(PROBLEM_ID, { publishStatus: 'ON_HOLD' });

      await expect(republish().execute(admin(), course.id.value)).rejects.toBeInstanceOf(
        CourseNotReadyError,
      );
      expect(kit.stored(course).status).toBe('ON_HOLD');
    });

    it('rejects hold of a draft course', async () => {
      const course = kit.seed();

      await expect(hold().execute(admin(), course.id.value)).rejects.toBeInstanceOf(
        InvalidCourseState,
      );
    });
  });

  describe('DetachQuizUseCase', () => {
    const detachQuiz = () =>
      new DetachQuizUseCase(
        kit.authorization,
        kit.views,
        kit.repository,
        kit.transactions,
        kit.readiness,
      );

    it('does not detach the last published content from a published Course', async () => {
      kit.quizCatalog.setQuiz(QUIZ_ID);
      const course = courseWithQuiz();
      course.publish();
      kit.seed(course);

      await expect(
        detachQuiz().execute(admin(), course.id.value, course.chapters[0]!.id.value, QUIZ_ID),
      ).rejects.toMatchObject({ issues: ['PUBLISHED_CONTENT_REQUIRED'] });
      expect(kit.repository.saveCount).toBe(0);
      expect(kit.stored(course).chapters[0]!.quizRefs).toContain(QUIZ_ID);
    });

    it('detaches a Quiz when a published Problem remains', async () => {
      kit.catalog.setProblem(PROBLEM_ID);
      kit.quizCatalog.setQuiz(QUIZ_ID);
      const course = courseWithProblem();
      course.attachQuiz(course.chapters[0]!.id, QUIZ_ID);
      course.publish();
      kit.seed(course);

      await expect(
        detachQuiz().execute(admin(), course.id.value, course.chapters[0]!.id.value, QUIZ_ID),
      ).resolves.toMatchObject({ status: 'PUBLISHED' });
      expect(kit.stored(course).chapters[0]!.quizRefs).not.toContain(QUIZ_ID);
    });
  });

  describe('DeleteCourseUseCase', () => {
    it('hard-deletes a draft course', async () => {
      const course = kit.seed();

      await remove().execute(admin(), course.id.value);

      expect(kit.repository.hardDeleted).toEqual([course.id.value]);
      expect(kit.repository.store.has(course.id.value)).toBe(false);
    });

    it.each(['PUBLISHED', 'ON_HOLD'] as const)(
      'soft-deletes a %s course, keeps its status and never hard-deletes (AC-014)',
      async (status) => {
        const course = kit.seed();
        course.publish();
        if (status === 'ON_HOLD') course.hold();

        await remove().execute(admin(), course.id.value);

        expect(kit.stored(course).isDeleted).toBe(true);
        expect(kit.stored(course).status).toBe(status);
        expect(kit.repository.hardDeleted).toHaveLength(0);
      },
    );

    it('hides an already deleted course as not found', async () => {
      const course = kit.seed();
      course.publish();
      await remove().execute(admin(), course.id.value);

      await expect(remove().execute(admin(), course.id.value)).rejects.toBeInstanceOf(
        CourseNotFoundError,
      );
    });

    it('allows another ADMIN to delete and rejects a caller without permission', async () => {
      const course = kit.seed();

      await expect(remove().execute(student(), course.id.value)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      await expect(remove().execute(admin(OTHER_ID), course.id.value)).resolves.toBeUndefined();
      expect(kit.repository.store.has(course.id.value)).toBe(false);
    });
  });

  describe('RestoreCourseUseCase', () => {
    it('restores a soft-deleted course to its previous status', async () => {
      kit.catalog.setProblem(PROBLEM_ID);
      const course = kit.seed(courseWithProblem());
      course.publish();
      await remove().execute(admin(), course.id.value);

      const restored = await restore().execute(admin(), course.id.value);

      expect(restored.deletedAt).toBeNull();
      expect(restored.status).toBe('PUBLISHED');
    });

    it('rejects restore of a course that is not deleted', async () => {
      const course = kit.seed();

      await expect(restore().execute(admin(), course.id.value)).rejects.toBeInstanceOf(
        InvalidCourseState,
      );
    });

    it('allows another ADMIN to restore', async () => {
      const course = kit.seed();
      course.publish();
      await remove().execute(admin(), course.id.value);

      await expect(restore().execute(admin(OTHER_ID), course.id.value)).resolves.toMatchObject({
        status: 'PUBLISHED',
      });
    });
  });
});
