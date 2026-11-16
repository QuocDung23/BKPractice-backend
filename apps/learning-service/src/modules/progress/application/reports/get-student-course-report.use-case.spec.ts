import {
  CourseReportForbiddenError,
  GetStudentCourseReportUseCase,
} from './get-student-course-report.use-case';
import type {
  LocalCourseReportReader,
  RemoteCourseReportReader,
} from './student-course-report.ports';

import { CourseCompletionCalculator } from '@/modules/progress/domain/services';

const ownerId = '00000000-0000-4000-8000-000000000001';
const otherId = '00000000-0000-4000-8000-000000000002';
const firstStudent = '00000000-0000-4000-8000-000000000003';
const secondStudent = '00000000-0000-4000-8000-000000000004';
const courseId = '00000000-0000-4000-8000-000000000005';
const chapterId = '00000000-0000-4000-8000-000000000006';
const visibleProblem = '00000000-0000-4000-8000-000000000007';
const hiddenProblem = '00000000-0000-4000-8000-000000000008';
const visibleQuiz = '00000000-0000-4000-8000-000000000009';
const principal = (role: string, userId = ownerId) => ({
  userId,
  roles: [role],
  permissions: ['course:read-managed'],
});

function fixture() {
  const local: jest.Mocked<LocalCourseReportReader> = {
    loadCourse: jest.fn().mockResolvedValue({
      courseId,
      createdBy: ownerId,
      submissionProblemIds: [visibleProblem, hiddenProblem],
      chapters: [{ chapterId, items: [{ type: 'PROBLEM', itemId: visibleProblem }] }],
    }),
    loadSolved: jest
      .fn()
      .mockResolvedValue(new Map([[firstStudent, new Map([[visibleProblem, new Date()]])]])),
    loadCompletedQuizzes: jest.fn().mockResolvedValue(new Map()),
  };
  const remote: jest.Mocked<RemoteCourseReportReader> = {
    loadStudents: jest.fn().mockResolvedValue({
      items: [
        { userId: firstStudent, studentId: '001', displayName: 'An' },
        { userId: secondStudent, studentId: '002', displayName: 'Bình' },
      ],
      page: 1,
      limit: 20,
      hasMore: false,
    }),
    loadSubmissionCounts: jest
      .fn()
      .mockImplementation(async (_userIds, problemIds: readonly string[]) =>
        [
          { userId: firstStudent, problemId: visibleProblem, count: 2 },
          { userId: firstStudent, problemId: hiddenProblem, count: 3 },
        ].filter((row) => problemIds.includes(row.problemId)),
      ),
  };
  return {
    local,
    remote,
    report: new GetStudentCourseReportUseCase(local, remote, new CourseCompletionCalculator()),
  };
}

describe('GetStudentCourseReportUseCase', () => {
  it('includes every Student, retained submission counts, and visible-only completion', async () => {
    const { local, remote, report } = fixture();
    const result = await report.execute(principal('LECTURER'), courseId, 1, 20);
    expect(result.items).toEqual([
      expect.objectContaining({
        userId: firstStudent,
        submissionCount: 5,
        completed: 1,
        total: 1,
        status: 'Hoàn thành',
        chapters: [{ chapterId, completed: 1, total: 1 }],
      }),
      expect.objectContaining({
        userId: secondStudent,
        submissionCount: 0,
        completed: 0,
        total: 1,
        status: 'Đang học',
        chapters: [{ chapterId, completed: 0, total: 1 }],
      }),
    ]);
    expect(local.loadSolved).toHaveBeenCalledWith([firstStudent, secondStudent], [visibleProblem]);
    expect(remote.loadSubmissionCounts).toHaveBeenCalledWith(
      [firstStudent, secondStudent],
      [visibleProblem, hiddenProblem],
    );
  });

  it('returns 0/0 with Chưa có bài tập while retaining old submissions', async () => {
    const { local, report } = fixture();
    local.loadCourse.mockResolvedValue({
      courseId,
      createdBy: ownerId,
      submissionProblemIds: [hiddenProblem],
      chapters: [{ chapterId, items: [] }],
    });
    const result = await report.execute(principal('ADMIN', otherId), courseId, 1, 20);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        submissionCount: 3,
        completed: 0,
        total: 0,
        status: 'Chưa có bài tập',
      }),
    );
  });

  it('counts a passed Quiz as a completed course Learning Item', async () => {
    const { local, report } = fixture();
    local.loadCourse.mockResolvedValue({
      courseId,
      createdBy: ownerId,
      submissionProblemIds: [],
      chapters: [{ chapterId, items: [{ type: 'QUIZ', itemId: visibleQuiz }] }],
    });
    local.loadCompletedQuizzes.mockResolvedValue(
      new Map([[firstStudent, new Map([[visibleQuiz, new Date()]])]]),
    );
    const result = await report.execute(principal('LECTURER'), courseId, 1, 20);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        completed: 1,
        total: 1,
        status: 'Hoàn thành',
        chapters: [{ chapterId, completed: 1, total: 1 }],
      }),
    );
    expect(local.loadCompletedQuizzes).toHaveBeenCalledWith(
      [firstStudent, secondStudent],
      [visibleQuiz],
    );
  });

  it('rejects another lecturer and Student before reading roster', async () => {
    const { remote, report } = fixture();
    await expect(
      report.execute(principal('LECTURER', otherId), courseId, 1, 20),
    ).rejects.toBeInstanceOf(CourseReportForbiddenError);
    await expect(report.execute(principal('STUDENT'), courseId, 1, 20)).rejects.toBeInstanceOf(
      CourseReportForbiddenError,
    );
    expect(remote.loadStudents).not.toHaveBeenCalled();
  });
});
