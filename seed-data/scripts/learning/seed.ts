import 'reflect-metadata';

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import learningDataSource from '@learning/database/data-source';
import { seedTaxonomy } from '@learning/database/seed-taxonomy';
import { type EntityManager } from 'typeorm';

interface Course {
  id: string;
  slug: string;
  title: string;
  description: string;
  createdBy: string;
  status: 'PUBLISHED';
  chapters: {
    id: string;
    key: string;
    title: string;
    description: string;
    displayOrder: number;
    topicName: string;
  }[];
}
interface Problem {
  id: string;
  key: string;
  courseKey: string;
  chapterKey: string;
  slug: string;
  title: string;
  description: string;
  problemType: 'STANDARD';
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  inputSpecification: string;
  outputSpecification: string;
  examples: { input: string; output: string; explanation: string }[];
  constraints: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  publishStatus: 'PUBLISHED';
  createdBy: string;
  topicName: string;
  testCases: {
    input: string;
    expectedOutput: string;
    isHidden: boolean;
    score: number;
    displayOrder: number;
  }[];
  languages: string[];
  starterCodes: Record<string, string>;
}
interface BankQuestion {
  id: string;
  revisionId: string;
  key: string;
  chapterKey: string;
  createdBy: string;
  clientRequestId: string;
  isPrivate: boolean;
  requestHash: string;
  content: string;
  explanation: string;
  options: { id: string; content: string; isCorrect: boolean }[];
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  topicName: string;
}
interface Quiz {
  id: string;
  revisionId: string;
  key: string;
  chapterKey: string;
  title: string;
  description: string;
  createdBy: string;
  clientRequestId: string;
  requestHash: string;
  status: 'PUBLISHED';
  publishedAt: string;
  questions: { questionId: string; questionRevisionId: string; displayOrder: number }[];
  displayOrder: number;
}

class SeedDataError extends Error {}
const createdAt = '2026-11-21T00:00:00.000Z';
const namespace = Buffer.from('cbd1c9f01eb14d639c2e414ce456a502', 'hex');

function stableUuid(name: string): string {
  const bytes = createHash('sha1').update(namespace).update(name).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), relativePath), 'utf8')) as T;
}

function readFixtures() {
  const courses = readJson<Course[]>('seed-data/data/learning/courses.json');
  const problems = courses.flatMap((_, index) =>
    readJson<Problem[]>(
      `seed-data/data/learning/problems/course-${String(index + 1).padStart(2, '0')}.json`,
    ),
  );
  const questions = courses.flatMap((_, index) =>
    readJson<BankQuestion[]>(
      `seed-data/data/learning/question-bank/course-${String(index + 1).padStart(2, '0')}.json`,
    ),
  );
  const quizzes = courses.flatMap((_, index) =>
    readJson<Quiz[]>(
      `seed-data/data/learning/quizzes/course-${String(index + 1).padStart(2, '0')}.json`,
    ),
  );
  if (
    courses.length !== 5 ||
    courses.some((course) => course.chapters.length !== 5) ||
    problems.length !== 250 ||
    questions.length !== 600 ||
    quizzes.length !== 125 ||
    quizzes.some(
      (quiz) =>
        quiz.questions.length !== 10 ||
        new Set(quiz.questions.map((q) => q.questionId)).size !== 10,
    )
  )
    throw new SeedDataError('Learning fixture counts or quiz-question links are invalid.');
  const chapters = courses.flatMap((course) => course.chapters);
  if (
    chapters.some(
      (chapter) =>
        problems.filter((problem) => problem.chapterKey === chapter.key).length !== 10 ||
        questions.filter((question) => question.chapterKey === chapter.key).length !== 24 ||
        quizzes.filter((quiz) => quiz.chapterKey === chapter.key).length !== 5,
    ) ||
    questions.some(
      (question) =>
        question.options.length < 2 ||
        question.options.length > 6 ||
        question.options.filter((option) => option.isCorrect).length !== 1,
    )
  )
    throw new SeedDataError('Chapter fixture counts or question options are invalid.');
  const questionsById = new Map(questions.map((question) => [question.id, question]));
  if (
    quizzes.some((quiz) =>
      quiz.questions.some((item) => {
        const question = questionsById.get(item.questionId);
        return (
          !question ||
          question.revisionId !== item.questionRevisionId ||
          question.chapterKey !== quiz.chapterKey
        );
      }),
    )
  )
    throw new SeedDataError('A quiz references a missing question or revision.');
  return { courses, problems, questions, quizzes };
}

async function insertRows(
  manager: EntityManager,
  table: string,
  columns: string[],
  rows: unknown[][],
  conflict = '(id)',
): Promise<void> {
  const batchSize = Math.max(1, Math.floor(60000 / columns.length));
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const params = batch.flat();
    const values = batch
      .map(
        (_, rowIndex) =>
          `(${columns.map((__, colIndex) => `$${rowIndex * columns.length + colIndex + 1}`).join(',')})`,
      )
      .join(',');
    await manager.query(
      `INSERT INTO ${table} (${columns.join(',')}) VALUES ${values} ON CONFLICT ${conflict} DO NOTHING`,
      params,
    );
  }
}

async function seedLearning(manager: EntityManager): Promise<void> {
  const { courses, problems, questions, quizzes } = readFixtures();
  await seedTaxonomy(manager);
  const topicRows: { id: string; name: string }[] = await manager.query(
    'SELECT id, name FROM topics',
  );
  const topicIds = new Map(topicRows.map((topic) => [topic.name, topic.id]));
  for (const name of new Set([
    ...problems.map((problem) => problem.topicName),
    ...questions.map((question) => question.topicName),
  ]))
    if (!topicIds.has(name)) throw new SeedDataError(`Missing Learning topic: ${name}.`);

  await insertRows(
    manager,
    'courses',
    [
      'id',
      'title',
      'slug',
      'description',
      'created_by',
      'status',
      'created_at',
      'updated_at',
      'deleted_at',
    ],
    courses.map((c) => [
      c.id,
      c.title,
      c.slug,
      c.description,
      c.createdBy,
      c.status,
      createdAt,
      createdAt,
      null,
    ]),
  );
  await insertRows(
    manager,
    'chapters',
    ['id', 'course_id', 'title', 'description', 'display_order'],
    courses.flatMap((c) =>
      c.chapters.map((ch) => [ch.id, c.id, ch.title, ch.description, ch.displayOrder]),
    ),
  );

  await insertRows(
    manager,
    'problems',
    [
      'id',
      'title',
      'slug',
      'description',
      'problem_type',
      'difficulty',
      'input_specification',
      'output_specification',
      'examples',
      'constraints',
      'time_limit_ms',
      'memory_limit_mb',
      'publish_status',
      'created_by',
      'type_config',
      'deleted_at',
      'created_at',
      'updated_at',
    ],
    problems.map((p) => [
      p.id,
      p.title,
      p.slug,
      p.description,
      p.problemType,
      p.difficulty,
      p.inputSpecification,
      p.outputSpecification,
      JSON.stringify(p.examples),
      p.constraints,
      p.timeLimitMs,
      p.memoryLimitMb,
      p.publishStatus,
      p.createdBy,
      null,
      null,
      createdAt,
      createdAt,
    ]),
  );
  await insertRows(
    manager,
    'problem_topics',
    ['problem_id', 'topic_id'],
    problems.map((p) => [p.id, topicIds.get(p.topicName)]),
    '(problem_id,topic_id)',
  );
  await insertRows(
    manager,
    'problem_languages',
    ['problem_id', 'language', 'enabled'],
    problems.flatMap((p) => p.languages.map((language) => [p.id, language, true])),
    '(problem_id,language)',
  );
  await insertRows(
    manager,
    'starter_codes',
    ['problem_id', 'language', 'source_code'],
    problems.flatMap((p) =>
      p.languages.map((language) => [p.id, language, p.starterCodes[language]]),
    ),
    '(problem_id,language)',
  );
  await insertRows(
    manager,
    'test_cases',
    ['id', 'problem_id', 'input', 'expected_output', 'is_hidden', 'score', 'display_order'],
    problems.flatMap((p) =>
      p.testCases.map((test) => [
        stableUuid(`test:${p.id}:${test.displayOrder}`),
        p.id,
        test.input,
        test.expectedOutput,
        test.isHidden,
        test.score,
        test.displayOrder,
      ]),
    ),
  );
  await insertRows(
    manager,
    'chapter_problems',
    ['id', 'chapter_id', 'course_id', 'problem_id', 'display_order'],
    problems.map((p, index) => [
      stableUuid(`chapter-problem:${p.chapterKey}:${p.id}`),
      courses[Number(p.courseKey.slice(1, 3)) - 1]!.chapters.find((ch) => ch.key === p.chapterKey)!
        .id,
      courses[Number(p.courseKey.slice(1, 3)) - 1]!.id,
      p.id,
      index % 10,
    ]),
  );

  await insertRows(
    manager,
    'quiz_bank_questions',
    [
      'id',
      'created_by',
      'current_revision_id',
      'client_request_id',
      'request_hash',
      'is_private',
      'deleted_at',
      'created_at',
      'updated_at',
    ],
    questions.map((q) => [
      q.id,
      q.createdBy,
      q.revisionId,
      q.clientRequestId,
      q.requestHash,
      q.isPrivate,
      null,
      createdAt,
      createdAt,
    ]),
  );
  await insertRows(
    manager,
    'quiz_bank_question_revisions',
    [
      'id',
      'question_id',
      'revision',
      'content',
      'explanation',
      'options',
      'difficulty',
      'topic_ids',
      'tag_ids',
      'created_at',
    ],
    questions.map((q) => [
      q.revisionId,
      q.id,
      1,
      q.content,
      q.explanation,
      JSON.stringify(q.options),
      q.difficulty,
      [topicIds.get(q.topicName)],
      [],
      createdAt,
    ]),
  );
  await insertRows(
    manager,
    'quizzes',
    [
      'id',
      'created_by',
      'status',
      'published_revision_id',
      'client_request_id',
      'request_hash',
      'deleted_at',
      'created_at',
      'updated_at',
    ],
    quizzes.map((q) => [
      q.id,
      q.createdBy,
      q.status,
      q.revisionId,
      q.clientRequestId,
      q.requestHash,
      null,
      createdAt,
      createdAt,
    ]),
  );
  await insertRows(
    manager,
    'quiz_revisions',
    ['id', 'quiz_id', 'revision', 'title', 'description', 'published_at', 'created_at'],
    quizzes.map((q) => [q.revisionId, q.id, 1, q.title, q.description, q.publishedAt, createdAt]),
  );
  await insertRows(
    manager,
    'quiz_revision_questions',
    ['id', 'quiz_revision_id', 'question_id', 'question_revision_id', 'display_order'],
    quizzes.flatMap((q) =>
      q.questions.map((item) => [
        stableUuid(`quiz-item:${q.id}:${item.questionId}`),
        q.revisionId,
        item.questionId,
        item.questionRevisionId,
        item.displayOrder,
      ]),
    ),
  );
  await insertRows(
    manager,
    'chapter_quizzes',
    ['id', 'chapter_id', 'quiz_id', 'display_order'],
    quizzes.map((q) => [
      stableUuid(`chapter-quiz:${q.chapterKey}:${q.id}`),
      courses[Number(q.chapterKey.slice(1, 3)) - 1]!.chapters.find((ch) => ch.key === q.chapterKey)!
        .id,
      q.id,
      q.displayOrder,
    ]),
  );

  const counts: {
    courses: number;
    chapters: number;
    problems: number;
    questions: number;
    quizzes: number;
  }[] = await manager.query(
    `SELECT (SELECT COUNT(*)::int FROM courses WHERE id = ANY($1::uuid[])) courses,
            (SELECT COUNT(*)::int FROM chapters WHERE id = ANY($2::uuid[])) chapters,
            (SELECT COUNT(*)::int FROM problems WHERE id = ANY($3::uuid[])) problems,
            (SELECT COUNT(*)::int FROM quiz_bank_questions WHERE id = ANY($4::uuid[])) questions,
            (SELECT COUNT(*)::int FROM quizzes WHERE id = ANY($5::uuid[])) quizzes`,
    [
      courses.map((c) => c.id),
      courses.flatMap((c) => c.chapters.map((ch) => ch.id)),
      problems.map((p) => p.id),
      questions.map((q) => q.id),
      quizzes.map((q) => q.id),
    ],
  );
  const count = counts[0];
  if (
    !count ||
    count.courses !== 5 ||
    count.chapters !== 25 ||
    count.problems !== 250 ||
    count.questions !== 600 ||
    count.quizzes !== 125
  )
    throw new SeedDataError('Learning fixture row counts did not match the requested dataset.');
}

export async function seedLearningDatabase(): Promise<{
  courses: number;
  chapters: number;
  problems: number;
  questions: number;
  quizzes: number;
}> {
  const fixtures = readFixtures();
  await learningDataSource.initialize();
  try {
    await learningDataSource.transaction((manager) => seedLearning(manager));
  } finally {
    await learningDataSource.destroy();
  }
  return {
    courses: fixtures.courses.length,
    chapters: 25,
    problems: fixtures.problems.length,
    questions: fixtures.questions.length,
    quizzes: fixtures.quizzes.length,
  };
}

if (require.main === module) {
  void seedLearningDatabase()
    .then((counts) => process.stdout.write(`Learning demo data ready: ${JSON.stringify(counts)}\n`))
    .catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof SeedDataError ? error.message : 'Learning demo seed failed; check migrations and database configuration.'}\n`,
      );
      process.exitCode = 1;
      if (learningDataSource.isInitialized) void learningDataSource.destroy();
    });
}
