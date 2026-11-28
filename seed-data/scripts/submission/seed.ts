import { getLeaderboardPeriod } from '@learning/modules/leaderboard/leaderboard';
import submissionDataSource from '@submission/database/data-source';

import type { LearningFixtures } from '../learning/seed';
import { insertRows, SeedDataError, seedStride, stableUuid } from '../seed-utils';

const DAY_MS = 86_400_000;
type Problem = LearningFixtures['problems'][number];
type Status = 'ACCEPTED' | 'WRONG_ANSWER' | 'COMPILE_ERROR' | 'RUNTIME_ERROR' | 'EXECUTED';

interface DemoSubmission {
  id: string;
  userId: string;
  problem: Problem;
  status: Status;
  resultAt: Date;
}

export interface DemoSolve {
  userId: string;
  problemId: string;
  eventId: string;
  solvedAt: Date;
}

export interface DemoAttemptedProblem {
  userId: string;
  problemId: string;
  attemptedAt: Date;
}

const solutions: Record<string, string> = {
  '01': 'print(sum(values))',
  '02': 'print(max(values))',
  '03': 'print(min(values))',
  '04': 'print(sum(value % 2 == 0 for value in values))',
  '05': 'print(sum(value % k == 0 for value in values))',
  '06': 'print(*reversed(values))',
  '07': 'print(*sorted(values))',
  '08': 'print(sum(value > k for value in values))',
  '09': 'print(sum(values[:3]))',
  '10': 'print(math.gcd(*values))',
};

export function pythonSolution(problem: Problem): string {
  if (problem.referenceSolution) return problem.referenceSolution;
  const exercise = problem.key.slice(-2);
  const solution = solutions[exercise];
  if (!solution || !problem.languages.includes('python')) {
    throw new SeedDataError(`Unsupported practice fixture: ${problem.key}.`);
  }
  return [
    'import math',
    'import sys',
    '',
    'params = list(map(int, sys.stdin.readline().split()))',
    'n = params[0]',
    'k = params[1] if len(params) > 1 else 1',
    'values = list(map(int, sys.stdin.read().split()))[:n]',
    solution,
  ].join('\n');
}

export function planSubmissions(
  studentIds: string[],
  problems: Problem[],
  now: Date,
): DemoSubmission[] {
  const latestPeriodStart = Math.max(
    getLeaderboardPeriod('week', now).from.getTime(),
    getLeaderboardPeriod('month', now).from.getTime(),
  );
  const recentDuration = Math.min(DAY_MS, now.getTime() - latestPeriodStart);
  const stride = seedStride(problems.length);
  return studentIds.flatMap((userId) => {
    const index = Number.parseInt(userId.slice(0, 8), 16);
    const solved = Math.min(16 + ((index * 37) % 100), problems.length);
    const attempted = Math.min(5 + (index % 12), problems.length - solved);
    const runs = Math.min(5 + (index % 9), problems.length);
    const rows: DemoSubmission[] = [];

    function add(slot: number, status: Status, resultAt: Date): void {
      const problem = problems[(index * 19 + slot * stride) % problems.length]!;
      rows.push({
        id: stableUuid(`ui-seed:submission:${userId}:${problem.id}:${status}`),
        userId,
        problem,
        status,
        resultAt,
      });
    }

    for (let slot = 0; slot < solved; slot++) {
      const age =
        slot < 2 + (index % 12)
          ? Math.floor((recentDuration * (slot + 1)) / 15)
          : (1 + ((index * 5 + slot * 11) % 60)) * DAY_MS + (slot % 19) * 3_600_000;
      const resultAt = new Date(now.getTime() - age);
      add(slot, 'ACCEPTED', resultAt);
      if (slot % 7 === 0) add(slot, 'WRONG_ANSWER', new Date(resultAt.getTime() - 180_000));
    }
    for (let slot = solved; slot < solved + attempted; slot++) {
      const status = (['WRONG_ANSWER', 'COMPILE_ERROR', 'RUNTIME_ERROR'] as const)[slot % 3]!;
      add(slot, status, new Date(now.getTime() - ((index + slot * 3) % 48) * 3_600_000));
    }
    for (let slot = 0; slot < runs; slot++) {
      add(slot, 'EXECUTED', new Date(now.getTime() - ((index + slot * 5) % 90) * 3_600_000));
    }
    return rows;
  });
}

const sourceForFailure = {
  WRONG_ANSWER: 'print("Chưa giải xong")',
  COMPILE_ERROR: 'def solve(:\n    pass',
  RUNTIME_ERROR: 'print(1 // 0)',
};

export async function seedSubmissions(rows: DemoSubmission[]): Promise<{
  solves: DemoSolve[];
  attempted: DemoAttemptedProblem[];
}> {
  await submissionDataSource.initialize();
  try {
    return await submissionDataSource.transaction(async (manager) => {
      await insertRows(
        manager,
        'submissions',
        [
          'id',
          'public_id',
          'user_id',
          'problem_id',
          'kind',
          'language',
          'source_code',
          'stdin',
          'status',
          'score',
          'passed_tests',
          'total_tests',
          'runtime_ms',
          'memory_kb',
          'accepted_event_id',
          'progress_event_published_at',
          'created_at',
          'updated_at',
        ],
        rows.map(({ id, userId, problem, status, resultAt }) => {
          const run = status === 'EXECUTED';
          const accepted = status === 'ACCEPTED';
          const source = run || accepted ? pythonSolution(problem) : sourceForFailure[status];
          const total = problem.testCases.length;
          return [
            id,
            stableUuid(`ui-seed:public:${id}`),
            userId,
            problem.id,
            run ? 'RUN' : 'SUBMIT',
            'python',
            source,
            run ? problem.testCases[0]!.input : '',
            status,
            run
              ? null
              : accepted
                ? problem.testCases.reduce((score, test) => score + test.score, 0)
                : 0,
            run ? null : accepted ? total : 0,
            run ? null : total,
            run || accepted ? 15 + (id.charCodeAt(0) % 25) : null,
            run || accepted ? 8_192 + (id.charCodeAt(1) % 32) * 32 : null,
            accepted ? stableUuid(`ui-seed:accepted:${id}`) : null,
            accepted ? resultAt : null,
            new Date(resultAt.getTime() - 420),
            resultAt,
          ];
        }),
      );
      // Read persisted results so restarting after a partial seed retains the original activity dates.
      const persisted: {
        id: string;
        userId: string;
        problemId: string;
        status: Status;
        resultAt: Date;
        eventId: string | null;
      }[] = await manager.query(
        `SELECT id, user_id AS "userId", problem_id AS "problemId", status,
                updated_at AS "resultAt", accepted_event_id AS "eventId"
         FROM submissions WHERE id = ANY($1::uuid[])`,
        [rows.map(({ id }) => id)],
      );
      const planned = new Map(rows.map((row) => [row.id, row]));
      if (
        persisted.length !== rows.length ||
        persisted.some((row) => {
          const plan = planned.get(row.id);
          return (
            !plan ||
            plan.userId !== row.userId ||
            plan.problem.id !== row.problemId ||
            plan.status !== row.status ||
            (row.status === 'ACCEPTED' && !row.eventId)
          );
        })
      ) {
        throw new SeedDataError('Submission seed IDs conflict with existing results.');
      }
      await insertRows(
        manager,
        'submission_results',
        ['id', 'submission_id', 'stdout', 'stderr', 'compile_output', 'created_at'],
        persisted.map(({ id, status, resultAt }) => [
          stableUuid(`ui-seed:result:${id}`),
          id,
          status === 'EXECUTED' ? planned.get(id)!.problem.testCases[0]!.expectedOutput : null,
          status === 'RUNTIME_ERROR' ? 'ZeroDivisionError: integer division by zero' : null,
          status === 'COMPILE_ERROR' ? 'SyntaxError: invalid syntax (line 1)' : null,
          resultAt,
        ]),
      );

      return {
        solves: persisted.flatMap(({ userId, problemId, eventId, resultAt }) =>
          eventId ? [{ userId, problemId, eventId, solvedAt: resultAt }] : [],
        ),
        attempted: persisted.flatMap(({ userId, problemId, status, resultAt }) =>
          status === 'ACCEPTED' || status === 'EXECUTED'
            ? []
            : [{ userId, problemId, attemptedAt: resultAt }],
        ),
      };
    });
  } finally {
    await submissionDataSource.destroy();
  }
}
