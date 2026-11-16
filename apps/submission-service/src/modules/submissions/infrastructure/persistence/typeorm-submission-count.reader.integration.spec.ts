import { randomUUID } from 'node:crypto';

import { DataSource } from 'typeorm';

import { TypeormSubmissionCountReader } from './typeorm-submission-count.reader';

const databaseUrl = process.env.SUBMISSION_COUNT_TEST_DATABASE_URL;
const isolated = databaseUrl && new URL(databaseUrl).pathname.endsWith('_test');

(isolated ? describe : describe.skip)('Submission count PostgreSQL integration', () => {
  let database: DataSource;
  beforeAll(async () => {
    database = new DataSource({
      type: 'postgres',
      url: databaseUrl,
      migrations: ['apps/submission-service/src/database/migrations/*{.ts,.js}'],
      synchronize: false,
    });
    await database.initialize();
    await database.runMigrations();
  });
  afterAll(async () => {
    await database?.destroy();
  });

  it('counts saved SUBMIT rows including retries and failed verdicts, excluding RUN', async () => {
    const userId = randomUUID();
    const problemId = randomUUID();
    const otherProblem = randomUUID();
    const insert = (kind: 'SUBMIT' | 'RUN', problem: string, status: string) =>
      database.query(
        `INSERT INTO submissions (user_id, problem_id, kind, language, source_code, status)
       VALUES ($1, $2, $3, 'cpp', 'int main(){}', $4)`,
        [userId, problem, kind, status],
      );
    await insert('SUBMIT', problemId, 'PENDING');
    await insert('SUBMIT', problemId, 'WRONG_ANSWER');
    await insert('RUN', problemId, 'EXECUTED');
    await insert('SUBMIT', otherProblem, 'ACCEPTED');
    const reader = new TypeormSubmissionCountReader(database);
    expect(await reader.count([userId], [problemId])).toEqual([{ userId, problemId, count: 2 }]);
    expect(await reader.count([randomUUID()], [problemId])).toEqual([]);
  });
});
