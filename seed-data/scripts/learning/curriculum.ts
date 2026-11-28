import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { SeedDataError, stableUuid } from '../seed-utils';

import type { LearningFixtures, Problem } from './seed';

interface CurriculumProblem {
  slug: string;
  title: string;
  statement: string;
  input: string;
  output: string;
  constraints: string;
  difficulty: Problem['difficulty'];
  solution: string;
  cases: [input: string, output: string][];
}

interface CurriculumQuestion {
  prompt: string;
  options: string[];
  correct: number;
  explanation: string;
}

interface CurriculumCourse {
  slug: string;
  title: string;
  description: string;
  chapters: {
    slug: string;
    title: string;
    description: string;
    topic: string;
    problems: CurriculumProblem[];
    questions: CurriculumQuestion[];
  }[];
}

const publishedAt = '2026-11-24T00:00:00.000Z';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const normalize = (value: string) =>
  value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
const difficultyOrder = { EASY: 0, MEDIUM: 1, HARD: 2 };

function checkUnique(seen: Set<string>, value: string, kind: string): void {
  const key = normalize(value);
  if (!key || seen.has(key))
    throw new SeedDataError(`Curriculum has duplicate or empty ${kind}: ${value}.`);
  seen.add(key);
}

export function readCurriculum(template: Problem): LearningFixtures {
  const source = JSON.parse(
    readFileSync('seed-data/data/learning/curriculum.json', 'utf8'),
  ) as CurriculumCourse[];
  const { createdBy, languages, starterCodes } = template;
  const result: LearningFixtures = { courses: [], problems: [], questions: [], quizzes: [] };
  const descriptions = new Set<string>();
  const titles = new Set<string>();
  const prompts = new Set<string>();
  for (const [courseIndex, course] of source.entries()) {
    const courseKey = `curriculum-${course.slug}`;
    const courseId = stableUuid(`learning:${courseKey}`);
    result.courses.push({
      id: courseId,
      slug: courseKey,
      title: course.title,
      description: course.description,
      createdBy,
      status: 'PUBLISHED',
      createdAt: new Date(Date.parse(publishedAt) - courseIndex * 60_000).toISOString(),
      chapters: course.chapters.map((chapter, chapterIndex) => ({
        id: stableUuid(`learning:${courseKey}:${chapter.slug}`),
        key: `${courseKey}:${chapter.slug}`,
        title: chapter.title,
        description: chapter.description,
        displayOrder: chapterIndex,
        topicName: chapter.topic,
      })),
    });
    for (const chapter of course.chapters) {
      const chapterKey = `${courseKey}:${chapter.slug}`;
      const sortedProblems = [...chapter.problems].sort(
        (a, b) => difficultyOrder[a.difficulty] - difficultyOrder[b.difficulty],
      );
      for (const problem of sortedProblems) {
        checkUnique(titles, problem.title, 'exercise title');
        checkUnique(descriptions, problem.statement, 'exercise statement');
        if (
          problem.cases.length !== 4 ||
          new Set(problem.cases.map(([input]) => input.trim())).size !== 4 ||
          !problem.solution.trim()
        ) {
          throw new SeedDataError(
            `Curriculum exercise "${problem.slug}" needs four distinct cases and a reference solution.`,
          );
        }
        const key = `curriculum-${problem.slug}`;
        const [input, output] = problem.cases[0]!;
        result.problems.push({
          id: stableUuid(`learning:exercise:${key}`),
          key,
          slug: key,
          courseKey,
          chapterKey,
          title: problem.title,
          description: problem.statement,
          problemType: 'STANDARD',
          difficulty: problem.difficulty,
          inputSpecification: problem.input,
          outputSpecification: problem.output,
          examples: [{ input, output, explanation: '' }],
          constraints: problem.constraints,
          timeLimitMs: 2000,
          memoryLimitMb: 256,
          publishStatus: 'PUBLISHED',
          createdBy,
          topicName: chapter.topic,
          testCases: problem.cases.map(([testInput, expectedOutput], displayOrder) => ({
            input: testInput,
            expectedOutput,
            displayOrder,
            score: 25,
            isHidden: displayOrder > 0,
          })),
          languages,
          starterCodes,
          referenceSolution: problem.solution,
        });
      }
      const questions = chapter.questions.map((question, displayOrder) => {
        checkUnique(prompts, question.prompt, 'quiz prompt');
        if (
          question.options.length < 2 ||
          question.options.length > 6 ||
          new Set(question.options.map(normalize)).size !== question.options.length ||
          !Number.isInteger(question.correct) ||
          !question.options[question.correct]
        ) {
          throw new SeedDataError(`Invalid options for curriculum quiz "${chapter.title}".`);
        }
        const key = `${chapterKey}:question:${hash(normalize(question.prompt))}`;
        const id = stableUuid(key);
        const revisionId = stableUuid(`${key}:revision:1`);
        result.questions.push({
          id,
          revisionId,
          key,
          chapterKey,
          createdBy,
          topicName: chapter.topic,
          clientRequestId: stableUuid(`${key}:request`),
          requestHash: hash(JSON.stringify(question)),
          isPrivate: false,
          difficulty: 'EASY',
          content: question.prompt,
          explanation: question.explanation,
          options: question.options.map((content, index) => ({
            id: stableUuid(`${key}:option:${index}`),
            content,
            isCorrect: index === question.correct,
          })),
        });
        return { questionId: id, questionRevisionId: revisionId, displayOrder };
      });
      const key = `${chapterKey}:quiz`;
      result.quizzes.push({
        id: stableUuid(key),
        revisionId: stableUuid(`${key}:revision:1`),
        key,
        chapterKey,
        createdBy,
        publishedAt,
        questions,
        displayOrder: 0,
        title: `Ôn tập ${chapter.title.toLowerCase()}`,
        description: 'Hoàn thành phần luyện tập của chương trước khi kiểm tra lại kiến thức.',
        clientRequestId: stableUuid(`${key}:request`),
        requestHash: hash(JSON.stringify(questions)),
        status: 'PUBLISHED',
      });
    }
  }
  return result;
}
