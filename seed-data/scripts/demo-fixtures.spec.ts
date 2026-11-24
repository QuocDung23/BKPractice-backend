import { getLeaderboardPeriod } from '@learning/modules/leaderboard/leaderboard';

import { planCommunity } from './community/seed';
import { readDemoLecturers, readDemoStudentIds } from './identity/seed';
import { planQuizActivity } from './learning/activity';
import { readLearningFixtures } from './learning/seed';
import { stableUuid } from './seed-utils';
import { planSubmissions } from './submission/seed';

describe('linked demo seed fixtures', () => {
  const catalog = readLearningFixtures();
  const now = new Date('2026-11-24T08:15:00.000Z');
  const students = Array.from({ length: 22 }, (_, index) => stableUuid(`test-student:${index}`));
  const lecturers = readDemoLecturers();

  it('only plans lecturer accounts and requires explicit IDs for student activity', () => {
    expect(lecturers).toHaveLength(13);
    expect(
      lecturers.every(({ role, studentId }) => role === 'LECTURER' && studentId === null),
    ).toBe(true);
    expect(new Set(lecturers.map(({ id }) => id)).size).toBe(lecturers.length);
    expect(readDemoLecturers()).toEqual(lecturers);
    expect(readDemoStudentIds('')).toEqual([]);
    expect(planSubmissions([], catalog.problems, now)).toEqual([]);
    expect(planQuizActivity([], catalog, now)).toEqual({ attempts: [], answers: [] });
    expect(readDemoStudentIds(`${students[0]}, ${students[0]}, ${students[1]}`)).toEqual(
      students.slice(0, 2),
    );
    expect(() => readDemoStudentIds('221000000')).toThrow('existing test student UUIDs');
  });

  it('keeps stable fixture IDs and produces one solve per selected student and problem', () => {
    const rows = planSubmissions(students, catalog.problems, now);
    const ids = rows.map((row) => row.id);
    expect(new Set(ids).size).toBe(rows.length);
    expect(
      planSubmissions(students, catalog.problems, new Date('2026-12-01T08:15:00Z')).map(
        (row) => row.id,
      ),
    ).toEqual(ids);
    expect(
      planSubmissions([...students].reverse(), catalog.problems, now)
        .map((row) => row.id)
        .sort(),
    ).toEqual([...ids].sort());
    const accepted = rows.filter((row) => row.status === 'ACCEPTED');
    expect(accepted.length).toBeGreaterThan(1000);
    const days = new Set(accepted.map(({ resultAt }) => resultAt.toISOString().slice(0, 10)));
    expect(days.size).toBeGreaterThan(30);
    const from = getLeaderboardPeriod('week', now).from;
    expect(accepted.filter(({ resultAt }) => resultAt >= from).length).toBeGreaterThan(100);
    expect(new Set(rows.map(({ status }) => status))).toEqual(
      new Set(['ACCEPTED', 'WRONG_ANSWER', 'COMPILE_ERROR', 'RUNTIME_ERROR', 'EXECUTED']),
    );
  });

  it('links answers to the exact quiz revision and computes the persisted pass threshold', () => {
    const activity = planQuizActivity(students, catalog, now);
    const passed = new Set<boolean>();
    for (const [
      id,
      ,
      ,
      revisionId,
      status,
      total,
      correct,
      pass,
      startedAt,
      finishedAt,
    ] of activity.attempts) {
      const quiz = catalog.quizzes.find((item) => item.revisionId === revisionId)!;
      const answers = activity.answers.filter(([attemptId]) => attemptId === id);
      expect(
        answers.every(([, questionId, questionRevisionId]) =>
          quiz.questions.some(
            (item) =>
              item.questionId === questionId && item.questionRevisionId === questionRevisionId,
          ),
        ),
      ).toBe(true);
      expect(
        answers.every(([, , , , , answeredAt]) => answeredAt >= startedAt && answeredAt <= now),
      ).toBe(true);
      if (status === 'FINISHED') {
        expect(answers).toHaveLength(total);
        expect(answers.filter(([, , , , isCorrect]) => isCorrect)).toHaveLength(correct!);
        expect(pass).toBe(correct! * 100 >= total * 90);
        expect(finishedAt).not.toBeNull();
        passed.add(pass!);
      } else {
        expect(answers.length).toBeLessThan(total);
        expect(finishedAt).toBeNull();
      }
    }
    expect(passed).toEqual(new Set([true, false]));
  });

  it('uses all community scopes with valid references and a single level of replies', () => {
    const community = planCommunity(
      lecturers.map(({ id }) => id),
      catalog,
      now,
    );
    const posts = new Set(community.posts.map(([id]) => id));
    expect(community.posts).toHaveLength(lecturers.length * 30);
    expect(new Set(community.posts.map((row) => row[2]))).toEqual(
      new Set(['GLOBAL', 'COURSE', 'PROBLEM']),
    );
    for (const row of community.posts) {
      expect(Boolean(row[4])).toBe(row[2] === 'PROBLEM');
      expect(Boolean(row[5])).toBe(row[2] === 'COURSE');
    }
    const rootComments = new Map(
      community.replies
        .filter(([, , , parentId]) => parentId === null)
        .map(([id, postId]) => [id, postId]),
    );
    for (const [, postId, , parentId] of community.replies) {
      expect(posts.has(postId)).toBe(true);
      if (parentId) expect(rootComments.get(parentId)).toBe(postId);
    }
    expect(community.bookmarks.length).toBeGreaterThan(0);
    expect(community.reports.length).toBeGreaterThan(0);
  });
});
