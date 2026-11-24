import 'reflect-metadata';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import learningDataSource from '@learning/database/data-source';
import { seedTaxonomy } from '@learning/database/seed-taxonomy';
import { type EntityManager } from 'typeorm';

import { insertRows, SeedDataError, stableUuid } from '../seed-utils';

import { readCurriculum } from './curriculum';

export interface Course {
  id: string;
  slug: string;
  title: string;
  description: string;
  createdBy: string;
  status: 'PUBLISHED';
  createdAt?: string;
  chapters: {
    id: string;
    key: string;
    title: string;
    description: string;
    displayOrder: number;
    topicName: string;
  }[];
}
export interface Problem {
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
  referenceSolution?: string;
}
export interface BankQuestion {
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
export interface Quiz {
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

const createdAt = '2026-11-21T00:00:00.000Z';
function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), relativePath), 'utf8')) as T;
}

function readLegacyFixtures(): LearningFixtures {
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
  return { courses, problems, questions, quizzes };
}

export interface LearningFixtures {
  courses: Course[];
  problems: Problem[];
  questions: BankQuestion[];
  quizzes: Quiz[];
}

export function countLearningFixtures(fixtures: LearningFixtures) {
  return {
    courses: fixtures.courses.length,
    chapters: fixtures.courses.reduce((count, course) => count + course.chapters.length, 0),
    problems: fixtures.problems.length,
    questions: fixtures.questions.length,
    quizzes: fixtures.quizzes.length,
  };
}

function validateFixtures({ courses, problems, questions, quizzes }: LearningFixtures): void {
  const chapters = courses.flatMap((course) => course.chapters);
  const chapterKeys = new Set(chapters.map((chapter) => chapter.key));
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const identifierGroups = [
    courses.map((course) => course.id),
    courses.map((course) => course.slug),
    chapters.map((chapter) => chapter.id),
    chapters.map((chapter) => chapter.key),
    problems.map((problem) => problem.id),
    problems.map((problem) => problem.slug),
    questions.map((question) => question.id),
    questions.map((question) => question.revisionId),
    quizzes.map((quiz) => quiz.id),
    quizzes.map((quiz) => quiz.revisionId),
  ];
  if (identifierGroups.some((group) => new Set(group).size !== group.length)) {
    throw new SeedDataError('Learning fixtures contain duplicate IDs, slugs or chapter keys.');
  }
  if ([...problems, ...questions].some(({ chapterKey }) => !chapterKeys.has(chapterKey))) {
    throw new SeedDataError('A learning fixture references an unknown chapter.');
  }
  for (const quiz of quizzes) {
    if (
      !chapterKeys.has(quiz.chapterKey) ||
      quiz.questions.length === 0 ||
      new Set(quiz.questions.map((item) => item.questionId)).size !== quiz.questions.length ||
      quiz.questions.some((item) => {
        const question = questionById.get(item.questionId);
        return (
          question?.revisionId !== item.questionRevisionId ||
          question.chapterKey !== quiz.chapterKey
        );
      })
    ) {
      throw new SeedDataError('A quiz points to an unknown or duplicate question revision.');
    }
  }
}

export function readLearningFixtures(curriculumOnly = false): LearningFixtures {
  const legacy = readLegacyFixtures();
  const curriculum = readCurriculum(legacy.problems[0]!);
  const fixtures = curriculumOnly
    ? curriculum
    : {
        courses: [...legacy.courses, ...curriculum.courses],
        problems: [...legacy.problems, ...curriculum.problems],
        questions: [...legacy.questions, ...curriculum.questions],
        quizzes: [...legacy.quizzes, ...curriculum.quizzes],
      };
  validateFixtures(fixtures);
  return fixtures;
}

async function assertSlugsMatch(
  manager: EntityManager,
  table: 'courses' | 'problems',
  fixtures: { id: string; slug: string }[],
): Promise<void> {
  const bySlug = new Map(fixtures.map(({ id, slug }) => [slug, id]));
  const existing: { id: string; slug: string }[] = await manager.query(
    `SELECT id, slug FROM ${table} WHERE slug = ANY($1::text[])`,
    [[...bySlug.keys()]],
  );
  for (const { id, slug } of existing) {
    if (bySlug.get(slug) !== id) {
      throw new SeedDataError(
        `Learning slug "${slug}" is already in use. No Learning seed changes were committed.`,
      );
    }
  }
}

async function seedLearning(
  manager: EntityManager,
  { courses, problems, questions, quizzes }: LearningFixtures,
): Promise<void> {
  await seedTaxonomy(manager);
  await assertSlugsMatch(manager, 'courses', courses);
  await assertSlugsMatch(manager, 'problems', problems);
  const chapterByKey = new Map(
    courses.flatMap((course) =>
      course.chapters.map(
        (chapter) => [chapter.key, { chapterId: chapter.id, courseId: course.id }] as const,
      ),
    ),
  );
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
      c.createdAt ?? createdAt,
      c.createdAt ?? createdAt,
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
  const nextProblemOrder = new Map<string, number>();
  await insertRows(
    manager,
    'chapter_problems',
    ['id', 'chapter_id', 'course_id', 'problem_id', 'display_order'],
    problems.map((p) => {
      const { chapterId, courseId } = chapterByKey.get(p.chapterKey)!;
      const displayOrder = nextProblemOrder.get(p.chapterKey) ?? 0;
      nextProblemOrder.set(p.chapterKey, displayOrder + 1);
      return [
        stableUuid(`chapter-problem:${p.chapterKey}:${p.id}`),
        chapterId,
        courseId,
        p.id,
        displayOrder,
      ];
    }),
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
      chapterByKey.get(q.chapterKey)!.chapterId,
      q.id,
      q.displayOrder,
    ]),
  );

  const expected = countLearningFixtures({ courses, problems, questions, quizzes });
  const counts: (typeof expected)[] = await manager.query(
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
    Object.entries(count).some(([key, value]) => expected[key as keyof typeof expected] !== value)
  )
    throw new SeedDataError('Learning fixture row counts did not match the requested dataset.');
}

export async function seedLearningDatabase(
  fixtures = readLearningFixtures(),
): Promise<ReturnType<typeof countLearningFixtures>> {
  await learningDataSource.initialize();
  try {
    await learningDataSource.transaction((manager) => seedLearning(manager, fixtures));
  } finally {
    await learningDataSource.destroy();
  }
  return countLearningFixtures(fixtures);
}

if (require.main === module) {
  const main = async () => {
    const fixtures = readLearningFixtures(process.argv.includes('--curriculum-only'));
    if (process.argv.includes('--dry-run')) {
      process.stdout.write(
        `Learning demo plan: ${JSON.stringify(countLearningFixtures(fixtures))}\n`,
      );
      return;
    }
    const counts = await seedLearningDatabase(fixtures);
    process.stdout.write(`Learning demo data ready: ${JSON.stringify(counts)}\n`);
  };
  void main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof SeedDataError ? error.message : 'Learning demo seed failed; check migrations and database configuration.'}\n`,
    );
    process.exitCode = 1;
    if (learningDataSource.isInitialized) void learningDataSource.destroy();
  });
}
