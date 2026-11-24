import learningDataSource from '@learning/database/data-source';

import type { DemoUser } from '../identity/seed';
import { insertRows, SeedDataError, stableUuid } from '../seed-utils';
import type { DemoAttemptedProblem, DemoSolve } from '../submission/seed';

import type { LearningFixtures } from './seed';

type QuizAttemptRow = [
  id: string,
  userId: string,
  quizId: string,
  revisionId: string,
  status: 'IN_PROGRESS' | 'FINISHED',
  total: number,
  correct: number | null,
  passed: boolean | null,
  startedAt: Date,
  finishedAt: Date | null,
];
type QuizAnswerRow = [
  attemptId: string,
  questionId: string,
  revisionId: string,
  optionId: string,
  correct: boolean,
  answeredAt: Date,
];

export function planQuizActivity(
  students: DemoUser[],
  fixtures: LearningFixtures,
  now: Date,
): { attempts: QuizAttemptRow[]; answers: QuizAnswerRow[] } {
  const questions = new Map(fixtures.questions.map((question) => [question.id, question]));
  const attempts: QuizAttemptRow[] = [];
  const answers: QuizAnswerRow[] = [];
  for (const [index, student] of students.entries()) {
    const count = index % 13 === 0 && index > 1 ? 0 : 6 + ((index * 9) % 30);
    for (let slot = 0; slot < count; slot++) {
      const quiz = fixtures.quizzes[(index * 11 + slot * 37) % fixtures.quizzes.length]!;
      const attemptId = stableUuid(`ui-seed:quiz-attempt:${student.id}:${quiz.id}`);
      const inProgress = slot === 0 && index % 5 === 0;
      const total = quiz.questions.length;
      const correctCount = 3 + ((index * 5 + slot * 3) % (total - 2));
      const duration = 10 * 60_000;
      const latestStart = now.getTime() - duration;
      const earliestStart = Math.min(latestStart, Date.parse(quiz.publishedAt));
      const startedAt = new Date(
        Math.max(earliestStart, latestStart - ((index + slot * 17) % 480) * 3_600_000),
      );
      const finishedAt = new Date(startedAt.getTime() + duration);
      attempts.push([
        attemptId,
        student.id,
        quiz.id,
        quiz.revisionId,
        inProgress ? 'IN_PROGRESS' : 'FINISHED',
        total,
        inProgress ? null : correctCount,
        inProgress ? null : correctCount * 100 >= total * 90,
        startedAt,
        inProgress ? null : finishedAt,
      ]);
      for (const [position, item] of quiz.questions.entries()) {
        if (inProgress && position >= 3) break;
        const question = questions.get(item.questionId)!;
        const correct = (position + index) % total < correctCount;
        const option = question.options.find((candidate) => candidate.isCorrect === correct)!;
        answers.push([
          attemptId,
          question.id,
          question.revisionId,
          option.id,
          option.isCorrect,
          new Date(startedAt.getTime() + (position + 1) * 45_000),
        ]);
      }
    }
  }
  return { attempts, answers };
}

export async function seedLearningActivity(
  solves: DemoSolve[],
  attempted: DemoAttemptedProblem[],
  quiz: ReturnType<typeof planQuizActivity>,
): Promise<void> {
  await learningDataSource.initialize();
  try {
    await learningDataSource.transaction(async (manager) => {
      const problems: { id: string; difficulty: 'EASY' | 'MEDIUM' | 'HARD' }[] =
        await manager.query('SELECT id, difficulty FROM problems WHERE id = ANY($1::uuid[])', [
          [...new Set(solves.map(({ problemId }) => problemId))],
        ]);
      const xpByDifficulty = { EASY: 10, MEDIUM: 20, HARD: 30 };
      const xpByProblem = new Map(
        problems.map(({ id, difficulty }) => [id, xpByDifficulty[difficulty]]),
      );
      await insertRows(
        manager,
        'progress_event_receipts',
        ['event_id', 'user_id', 'problem_id', 'received_at'],
        solves.map(({ eventId, userId, problemId, solvedAt }) => [
          eventId,
          userId,
          problemId,
          solvedAt,
        ]),
        '(event_id)',
      );
      await insertRows(
        manager,
        'progress',
        [
          'user_id',
          'problem_id',
          'status',
          'best_score',
          'solved_at',
          'last_event_id',
          'awarded_xp',
          'updated_at',
        ],
        solves.map(({ userId, problemId, eventId, solvedAt }) => {
          const xp = xpByProblem.get(problemId);
          if (!xp) throw new SeedDataError('Learning seed cannot resolve a submitted problem.');
          return [userId, problemId, 'SOLVED', 100, solvedAt, eventId, xp, solvedAt];
        }),
        '(user_id, problem_id)',
      );
      await insertRows(
        manager,
        'progress',
        ['user_id', 'problem_id', 'status', 'best_score', 'updated_at'],
        attempted.map(({ userId, problemId, attemptedAt }) => [
          userId,
          problemId,
          'ATTEMPTED',
          0,
          attemptedAt,
        ]),
        '(user_id, problem_id)',
      );
      await insertRows(
        manager,
        'quiz_attempts',
        [
          'id',
          'user_id',
          'quiz_id',
          'quiz_revision_id',
          'status',
          'total_questions',
          'correct_count',
          'passed',
          'started_at',
          'finished_at',
        ],
        quiz.attempts,
        '',
      );
      // A real in-progress attempt can occupy the unique student/quiz slot. Keep its answers.
      const saved: { id: string; startedAt: Date }[] = await manager.query(
        'SELECT id, started_at AS "startedAt" FROM quiz_attempts WHERE id = ANY($1::uuid[])',
        [quiz.attempts.map(([id]) => id)],
      );
      const startedAtById = new Map(saved.map(({ id, startedAt }) => [id, startedAt]));
      const plannedStarts = new Map(quiz.attempts.map(([id, , , , , , , , date]) => [id, date]));
      await insertRows(
        manager,
        'quiz_attempt_answers',
        [
          'attempt_id',
          'question_id',
          'question_revision_id',
          'selected_option_id',
          'is_correct',
          'answered_at',
        ],
        quiz.answers.flatMap(([id, questionId, revisionId, optionId, correct, answeredAt]) => {
          const startedAt = startedAtById.get(id);
          if (!startedAt) return [];
          const plannedAt = plannedStarts.get(id)!;
          return [
            [
              id,
              questionId,
              revisionId,
              optionId,
              correct,
              new Date(startedAt.getTime() + answeredAt.getTime() - plannedAt.getTime()),
            ],
          ];
        }),
        '(attempt_id, question_id)',
      );
    });
  } finally {
    await learningDataSource.destroy();
  }
}
