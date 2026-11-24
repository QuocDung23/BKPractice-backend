import { getLeaderboardPeriod } from '@learning/modules/leaderboard/leaderboard';

import { planCommunity } from './community/seed';
import { readDemoUsers } from './identity/seed';
import { planQuizActivity } from './learning/activity';
import { readLearningFixtures } from './learning/seed';
import { planSubmissions } from './submission/seed';

describe('linked demo seed fixtures', () => {
  const catalog = readLearningFixtures();
  const now = new Date('2026-11-24T08:15:00.000Z');
  const students = readDemoUsers(20).filter((user) => user.role === 'STUDENT');

  it('keeps stable account IDs and produces one solve per student and problem', () => {
    const expanded = readDemoUsers(50).filter((user) => user.role === 'STUDENT');
    expect(expanded.slice(0, students.length)).toEqual(students);
    expect(new Set(expanded.map((user) => user.studentId)).size).toBe(expanded.length);
    const rows = planSubmissions(students, catalog.problems, now);
    const ids = rows.map((row) => row.id);
    expect(new Set(ids).size).toBe(rows.length);
    expect(
      planSubmissions(students, catalog.problems, new Date('2026-12-01T08:15:00Z')).map(
        (row) => row.id,
      ),
    ).toEqual(ids);
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
    const community = planCommunity(students, catalog, now);
    const posts = new Set(community.posts.map(([id]) => id));
    expect(community.posts).toHaveLength(students.length * 2);
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
