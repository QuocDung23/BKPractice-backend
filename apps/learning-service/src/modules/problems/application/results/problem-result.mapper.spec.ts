import type { SupportedLanguage } from '@app/contracts';
import type { PublishReadiness } from '@learning/modules/problems/domain/services/publish.validator';
import {
  buildProblem,
  functionContract,
  oopContract,
  starterCode,
  TEST_NOW,
} from '@learning/modules/problems/domain/testing/problem-test.factory';
import {
  EnabledLanguage,
  OopContract,
  TagReference,
  TopicReference,
} from '@learning/modules/problems/domain/value-objects';

import { ProblemResultMapper } from './problem-result.mapper';

const TOPIC_ID = '00000000-0000-4000-8000-000000000101';
const TAG_ID = '00000000-0000-4000-8000-000000000102';

describe('ProblemResultMapper', () => {
  it('maps a summary and resolves topic and tag names', async () => {
    const reader = readerMock();
    const mapper = new ProblemResultMapper(reader);
    const problem = buildProblem({
      topics: [new TopicReference(TOPIC_ID)],
      tags: [new TagReference(TAG_ID)],
      enabledLanguages: [new EnabledLanguage('python')],
    });

    reader.findTopicNames.mockResolvedValue(new Map([[TOPIC_ID, 'Arrays']]));
    reader.findTagNames.mockResolvedValue(new Map([[TAG_ID, 'Beginner']]));

    await expect(mapper.toSummary(problem)).resolves.toEqual({
      id: problem.id.value,
      slug: 'two-sum',
      title: 'Two Sum',
      problemType: 'STANDARD',
      difficulty: 'EASY',
      topics: [{ id: TOPIC_ID, name: 'Arrays' }],
      tags: [{ id: TAG_ID, name: 'Beginner' }],
      enabledLanguages: ['python'],
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
    });
    expect(reader.findTopicNames).toHaveBeenCalledWith([TOPIC_ID]);
    expect(reader.findTagNames).toHaveBeenCalledWith([TAG_ID]);
  });

  it('maps detail content, starter codes and FUNCTION contracts', async () => {
    const reader = readerMock();
    const mapper = new ProblemResultMapper(reader);
    const contract = functionContract('solve');
    const problem = buildProblem({
      problemType: 'FUNCTION',
      enabledLanguages: [new EnabledLanguage('python')],
      starterCodes: [starterCode('python', 'print(1)')],
      functionContracts: new Map<SupportedLanguage, typeof contract>([['python', contract]]),
    });

    reader.findTopicNames.mockResolvedValue(new Map());
    reader.findTagNames.mockResolvedValue(new Map());

    const detail = await mapper.toDetail(problem);

    expect(detail.statement).toBe(problem.statement.value);
    expect(detail.inputSpecification).toBe(problem.inputSpecification?.value);
    expect(detail.outputSpecification).toBe(problem.outputSpecification?.value);
    expect(detail.constraints).toBeNull();
    expect(detail.executionLimits).toEqual({ timeLimitMs: 1_000, memoryLimitMb: 256 });
    expect(detail.starterCodes).toEqual([{ language: 'python', sourceCode: 'print(1)' }]);
    expect(detail.functionContracts).toEqual([
      {
        language: 'python',
        functionName: 'solve',
        parameters: [{ name: 'values', type: 'number[]' }],
        returnType: 'number[]',
      },
    ]);
    expect(detail.oopContracts).toEqual([]);
  });

  it('maps OOP contracts including constructor contracts', async () => {
    const reader = readerMock();
    const mapper = new ProblemResultMapper(reader);
    const contract = new OopContract({
      structure: 'CLASS',
      name: 'Solution',
      constructorContract: {
        access: 'PROTECTED',
        parameters: [{ name: 'size', type: 'number' }],
      },
      methods: [
        {
          name: 'solve',
          access: 'PRIVATE',
          parameters: [{ name: 'values', type: 'number[]' }],
          returnType: 'number[]',
        },
      ],
    });
    const problem = buildProblem({
      problemType: 'OOP',
      enabledLanguages: [new EnabledLanguage('python')],
      oopContracts: new Map<SupportedLanguage, typeof contract>([['python', contract]]),
    });

    reader.findTopicNames.mockResolvedValue(new Map());
    reader.findTagNames.mockResolvedValue(new Map());

    const detail = await mapper.toDetail(problem);

    expect(detail.oopContracts).toEqual([
      {
        language: 'python',
        structure: 'CLASS',
        name: 'Solution',
        constructorContract: {
          access: 'PROTECTED',
          parameters: [{ name: 'size', type: 'number' }],
        },
        methods: [
          {
            name: 'solve',
            access: 'PRIVATE',
            parameters: [{ name: 'values', type: 'number[]' }],
            returnType: 'number[]',
          },
        ],
      },
    ]);
    expect(detail.functionContracts).toEqual([]);
  });

  it('maps a null OOP constructor contract and function contract factory', async () => {
    const reader = readerMock();
    const mapper = new ProblemResultMapper(reader);
    const contract = oopContract('Solution');
    const problem = buildProblem({
      problemType: 'OOP',
      enabledLanguages: [new EnabledLanguage('python')],
      oopContracts: new Map<SupportedLanguage, typeof contract>([['python', contract]]),
    });

    reader.findTopicNames.mockResolvedValue(new Map());
    reader.findTagNames.mockResolvedValue(new Map());

    const detail = await mapper.toDetail(problem);

    expect(detail.oopContracts[0]?.constructorContract).toBeNull();
  });

  it('adds managed fields and readiness to summary and detail results', async () => {
    const reader = readerMock();
    const mapper = new ProblemResultMapper(reader);
    const problem = buildProblem();

    reader.findTopicNames.mockResolvedValue(new Map());
    reader.findTagNames.mockResolvedValue(new Map());

    const readiness: PublishReadiness = {
      ready: false,
      issues: [
        { code: 'TITLE_REQUIRED', field: 'title', message: 'A problem title is required' },
        { code: 'PROBLEM_DELETED', message: 'A deleted problem cannot be published' },
      ],
    };

    await expect(mapper.toManagedSummary(problem, readiness)).resolves.toMatchObject({
      publishStatus: 'DRAFT',
      deletedAt: null,
      readiness: {
        ready: false,
        issues: [
          { code: 'TITLE_REQUIRED', field: 'title', message: 'A problem title is required' },
          { code: 'PROBLEM_DELETED', message: 'A deleted problem cannot be published' },
        ],
      },
    });

    await expect(mapper.toManagedDetail(problem, readiness)).resolves.toMatchObject({
      publishStatus: 'DRAFT',
      deletedAt: null,
      statement: problem.statement.value,
    });
  });

  it('batch-resolves unique names once for a page', async () => {
    const reader = readerMock();
    const mapper = new ProblemResultMapper(reader);
    const first = buildProblem({ topics: [new TopicReference(TOPIC_ID)] });
    const second = buildProblem({ topics: [new TopicReference(TOPIC_ID)] });

    reader.findTopicNames.mockResolvedValue(new Map([[TOPIC_ID, 'Arrays']]));
    reader.findTagNames.mockResolvedValue(new Map());

    const page = await mapper.toPage([first, second], 2, 1, 20);

    expect(page.total).toBe(2);
    expect(page.page).toBe(1);
    expect(page.limit).toBe(20);
    expect(page.items).toHaveLength(2);
    expect(page.items[0]?.topics).toEqual([{ id: TOPIC_ID, name: 'Arrays' }]);
    expect(reader.findTopicNames).toHaveBeenCalledTimes(1);
    expect(reader.findTopicNames).toHaveBeenCalledWith([TOPIC_ID]);
  });

  it('maps a managed page from the readiness map', async () => {
    const reader = readerMock();
    const mapper = new ProblemResultMapper(reader);
    const problem = buildProblem();
    const readiness: PublishReadiness = { ready: true, issues: [] };

    reader.findTopicNames.mockResolvedValue(new Map());
    reader.findTagNames.mockResolvedValue(new Map());

    const page = await mapper.toManagedPage(
      [problem],
      1,
      1,
      20,
      new Map([[problem.id.value, readiness]]),
    );

    expect(page.items[0]).toMatchObject({
      publishStatus: 'DRAFT',
      readiness: { ready: true, issues: [] },
    });
  });

  it('rejects a managed page without readiness for every problem', async () => {
    const reader = readerMock();
    const mapper = new ProblemResultMapper(reader);
    const problem = buildProblem();

    reader.findTopicNames.mockResolvedValue(new Map());
    reader.findTagNames.mockResolvedValue(new Map());

    await expect(mapper.toManagedPage([problem], 1, 1, 20, new Map())).rejects.toThrow(
      `Missing readiness for problem ${problem.id.value}`,
    );
  });

  it('rejects a summary when a referenced topic or tag has no name', async () => {
    const reader = readerMock();
    const mapper = new ProblemResultMapper(reader);
    const topicProblem = buildProblem({ topics: [new TopicReference(TOPIC_ID)] });
    const tagProblem = buildProblem({ tags: [new TagReference(TAG_ID)] });

    reader.findTopicNames.mockResolvedValue(new Map());
    reader.findTagNames.mockResolvedValue(new Map());

    await expect(mapper.toSummary(topicProblem)).rejects.toThrow(
      `Missing topic name for ${TOPIC_ID}`,
    );
    await expect(mapper.toSummary(tagProblem)).rejects.toThrow(`Missing tag name for ${TAG_ID}`);
  });
});

function readerMock() {
  return {
    findMissingTopicIds: jest.fn(),
    findMissingTagIds: jest.fn(),
    findTopicNames: jest.fn(),
    findTagNames: jest.fn(),
    listTopics: jest.fn().mockResolvedValue([]),
    listTags: jest.fn().mockResolvedValue([]),
  };
}
