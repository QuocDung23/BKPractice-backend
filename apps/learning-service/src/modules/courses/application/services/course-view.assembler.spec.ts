import {
  ChapterDescription,
  ChapterTitle,
  ProblemReference,
} from '@/modules/courses/domain/value-objects';
import {
  courseWithProblem,
  createCourseTestKit,
  draftCourse,
  OWNER_ID,
  PROBLEM_ID,
} from '@/modules/courses/testing';

const SECOND = '00000000-0000-4000-8000-0000000000d4';

const THIRD = '00000000-0000-4000-8000-0000000000e5';

describe('CourseViewAssembler', () => {
  const build = () => {
    const kit = createCourseTestKit();
    const course = draftCourse();
    const chapterId = course.addChapter({
      title: new ChapterTitle('Ch 1'),
      description: new ChapterDescription(null),
    });
    for (const id of [PROBLEM_ID, SECOND, THIRD]) {
      course.addProblemToChapter(chapterId, new ProblemReference(id));
    }
    kit.seed(course);
    return { kit, course };
  };

  describe('toLearner', () => {
    it('shows only published, non-deleted problems in order, with no trace of hidden ones (AC-004)', async () => {
      const { kit, course } = build();
      kit.catalog.setProblem(PROBLEM_ID, { publishStatus: 'PUBLISHED', title: 'First' });
      kit.catalog.setProblem(SECOND, { publishStatus: 'ON_HOLD', title: 'Held' });
      kit.catalog.setProblem(THIRD, { publishStatus: 'PUBLISHED', isDeleted: true, title: 'Gone' });

      const view = await kit.views.toLearner(course);

      expect(view.chapters[0]!.problems.map((p) => p.title)).toEqual(['First']);
      const json = JSON.stringify(view);
      for (const hidden of [SECOND, THIRD, 'Held', 'Gone']) expect(json).not.toContain(hidden);
    });

    it('hides a held problem and shows it again at the same position after republish (AC-010)', async () => {
      const { kit, course } = build();
      kit.catalog.setProblem(PROBLEM_ID, { title: 'A' });
      kit.catalog.setProblem(SECOND, { title: 'B' });
      kit.catalog.setProblem(THIRD, { title: 'C' });
      const titles = async () =>
        (await kit.views.toLearner(course)).chapters[0]!.problems.map((p) => p.title);

      kit.catalog.setProblem(SECOND, { title: 'B', publishStatus: 'ON_HOLD' });
      expect(await titles()).toEqual(['A', 'C']);

      kit.catalog.setProblem(SECOND, { title: 'B', publishStatus: 'PUBLISHED' });
      expect(await titles()).toEqual(['A', 'B', 'C']);
    });

    it('hides a draft problem the owner attached (AC-020) and unknown problems', async () => {
      const { kit, course } = build();
      kit.catalog.setProblem(PROBLEM_ID, { publishStatus: 'DRAFT', createdBy: OWNER_ID });

      const view = await kit.views.toLearner(course);

      expect(view.chapters[0]!.problems).toEqual([]);
      expect(view.chapters).toHaveLength(1); // Chapter rỗng vẫn xuất hiện
    });

    it('exposes only the learner fields: no status, owner, judge or test data (AC-015)', async () => {
      const { kit, course } = build();
      kit.catalog.setProblem(PROBLEM_ID);

      const view = await kit.views.toLearner(course);

      expect(Object.keys(view).sort()).toEqual(['chapters', 'description', 'id', 'slug', 'title']);
      expect(Object.keys(view.chapters[0]!.problems[0]!).sort()).toEqual([
        'difficulty',
        'id',
        'problemType',
        'slug',
        'title',
      ]);
    });
  });

  describe('toManaged', () => {
    it('reports every attached problem state, including hidden and missing ones', async () => {
      const { kit, course } = build();
      kit.catalog.setProblem(PROBLEM_ID);
      kit.catalog.setProblem(SECOND, { publishStatus: 'ON_HOLD' });
      kit.catalog.setProblem(THIRD, { isDeleted: true });

      const view = await kit.views.toManaged(course);

      expect(
        view.chapters[0]!.problems.map((p) => [p.problemId, p.publishStatus, p.isDeleted]),
      ).toEqual([
        [PROBLEM_ID, 'PUBLISHED', false],
        [SECOND, 'ON_HOLD', false],
        [THIRD, 'PUBLISHED', true],
      ]);
      expect(view.readiness).toEqual({ ready: true, issues: [] });
    });

    it('returns null fields for a problem that no longer exists', async () => {
      const kit = createCourseTestKit();
      const course = kit.seed(courseWithProblem());

      const view = await kit.views.toManaged(course);

      expect(view.chapters[0]!.problems[0]).toEqual({
        problemId: PROBLEM_ID,
        slug: null,
        title: null,
        publishStatus: null,
        isDeleted: null,
      });
      expect(view.readiness).toEqual({ ready: false, issues: ['PUBLISHED_CONTENT_REQUIRED'] });
    });
  });

  it('builds learner and managed summaries with the chapter count', () => {
    const kit = createCourseTestKit();
    const course = kit.seed(courseWithProblem());

    expect(kit.views.toLearnerSummary(course)).toEqual({
      id: course.id.value,
      slug: course.slug.value,
      title: course.title.value,
      chapterCount: 1,
    });
    expect(kit.views.toManagedSummary(course)).toMatchObject({
      status: 'DRAFT',
      chapterCount: 1,
      deletedAt: null,
    });
  });
});
