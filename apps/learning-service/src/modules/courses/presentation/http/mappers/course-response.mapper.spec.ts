import type {
  LearnerCourseResult,
  ManagedCourseResult,
} from '@/modules/courses/application/results';
import {
  toCourseDetailResponse,
  toCourseListResponse,
  toManagedCourseListResponse,
  toManagedCourseResponse,
} from '@/modules/courses/presentation/http/mappers/course-response.mapper';

const CREATED = new Date('2026-10-01T00:00:00.000Z');

const UPDATED = new Date('2026-10-02T00:00:00.000Z');

const DELETED = new Date('2026-10-03T00:00:00.000Z');

const managed: ManagedCourseResult = {
  id: 'c1',
  slug: 'intro-c',
  title: 'Intro C',
  description: null,
  status: 'PUBLISHED',
  createdBy: 'u1',
  createdAt: CREATED,
  updatedAt: UPDATED,
  deletedAt: null,
  chapters: [
    {
      id: 'ch1',
      title: 'Chapter 1',
      description: 'desc',
      problems: [
        { problemId: 'p1', slug: 's', title: 'T', publishStatus: 'ON_HOLD', isDeleted: false },
      ],
    },
  ],
  readiness: { ready: false, issues: ['PUBLISHED_CONTENT_REQUIRED'] },
};

describe('course response mappers', () => {
  it('maps a managed course to primitives and ISO dates, keeping problem states and readiness', () => {
    const response = toManagedCourseResponse(managed);

    expect(response).toEqual({
      ...managed,
      createdAt: CREATED.toISOString(),
      updatedAt: UPDATED.toISOString(),
      deletedAt: null,
      readiness: { ready: false, issues: ['PUBLISHED_CONTENT_REQUIRED'] },
    });
    expect(JSON.parse(JSON.stringify(response))).toEqual(response);
  });

  it('exposes deletedAt for a soft-deleted course', () => {
    expect(toManagedCourseResponse({ ...managed, deletedAt: DELETED }).deletedAt).toBe(
      DELETED.toISOString(),
    );
  });

  it('maps the learner detail without status, owner, timestamps or readiness', () => {
    const learner: LearnerCourseResult = {
      id: 'c1',
      slug: 'intro-c',
      title: 'Intro C',
      description: null,
      chapters: [
        {
          id: 'ch1',
          title: 'Chapter 1',
          description: null,
          problems: [
            { id: 'p1', slug: 's', title: 'T', problemType: 'ALGORITHM', difficulty: 'EASY' },
          ],
        },
      ],
    };

    const response = toCourseDetailResponse(learner);

    expect(response).toEqual(learner);
    expect(Object.keys(response).sort()).toEqual([
      'chapters',
      'description',
      'id',
      'slug',
      'title',
    ]);
  });

  it('maps pages to { items, total, page, pageSize }', () => {
    expect(
      toCourseListResponse({
        items: [{ id: 'c1', slug: 's', title: 'T', chapterCount: 2 }],
        total: 7,
        page: 2,
        limit: 1,
      }),
    ).toEqual({
      items: [{ id: 'c1', slug: 's', title: 'T', chapterCount: 2 }],
      total: 7,
      page: 2,
      pageSize: 1,
    });

    const list = toManagedCourseListResponse({
      items: [
        {
          id: 'c1',
          slug: 's',
          title: 'T',
          status: 'DRAFT',
          chapterCount: 0,
          createdAt: CREATED,
          updatedAt: UPDATED,
          deletedAt: DELETED,
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    });
    expect(list.items[0]).toMatchObject({
      createdAt: CREATED.toISOString(),
      deletedAt: DELETED.toISOString(),
    });
    expect(list.pageSize).toBe(20);
  });
});
