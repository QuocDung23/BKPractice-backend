import { DomainValidationError } from '@learning/modules/problems/domain/errors/domain-validation.error';
import type { CreateProblemRequestDto } from '@learning/modules/problems/presentation/http/dto/create-problem.request.dto';

import { ProblemRequestMapper } from './problem-request.mapper';

const TOPIC_ID = '00000000-0000-4000-8000-000000000201';
const TAG_ID = '00000000-0000-4000-8000-000000000202';

describe('ProblemRequestMapper', () => {
  const mapper = new ProblemRequestMapper();

  it('applies create defaults for optional fields', () => {
    const command = mapper.toCreateCommand(minimalCreateDto());

    expect(command.inputSpecification).toBeNull();
    expect(command.outputSpecification).toBeNull();
    expect(command.examples).toEqual([]);
    expect(command.constraints).toBeNull();
    expect(command.executionLimits.timeLimitMs).toBe(1_000);
    expect(command.executionLimits.memoryLimitMb).toBe(256);
    expect(command.topicIds).toEqual([]);
    expect(command.tagIds).toEqual([]);
    expect(command.enabledLanguages).toEqual([]);
    expect(command.starterCodes).toEqual([]);
    expect(command.functionContracts.size).toBe(0);
    expect(command.oopContracts.size).toBe(0);
  });

  it('maps a full create request into domain value objects', () => {
    const command = mapper.toCreateCommand({
      slug: 'two-sum',
      title: 'Two Sum',
      statement: 'Find two numbers.',
      inputSpecification: 'An array and a target.',
      outputSpecification: 'Two indices.',
      problemType: 'FUNCTION',
      difficulty: 'MEDIUM',
      examples: [{ input: '2 7', output: '0 1', explanation: 'Because 2 + 7 = 9' }],
      constraints: '2 <= n <= 10^4',
      executionLimits: { timeLimitMs: 500, memoryLimitMb: 128 },
      topicIds: [TOPIC_ID],
      tagIds: [TAG_ID],
      enabledLanguages: ['python', 'java'],
      starterCodes: [{ language: 'python', sourceCode: 'def solve(): pass' }],
      functionContracts: [
        {
          language: 'python',
          functionName: 'solve',
          parameters: [{ name: 'values', type: 'int[]' }],
          returnType: 'int[]',
        },
      ],
      oopContracts: [
        {
          language: 'java',
          structure: 'CLASS',
          name: 'Solution',
          constructorContract: { access: 'PUBLIC', parameters: [] },
          methods: [
            {
              name: 'solve',
              access: 'PUBLIC',
              parameters: [{ name: 'values', type: 'int[]' }],
              returnType: 'int[]',
            },
          ],
        },
      ],
    });

    expect(command.slug?.value).toBe('two-sum');
    expect(command.title.value).toBe('Two Sum');
    expect(command.statement.value).toBe('Find two numbers.');
    expect(command.inputSpecification?.value).toBe('An array and a target.');
    expect(command.outputSpecification?.value).toBe('Two indices.');
    expect(command.problemType).toBe('FUNCTION');
    expect(command.difficulty).toBe('MEDIUM');
    expect(command.examples[0]?.explanation).toBe('Because 2 + 7 = 9');
    expect(command.constraints?.value).toBe('2 <= n <= 10^4');
    expect(command.executionLimits.timeLimitMs).toBe(500);
    expect(command.executionLimits.memoryLimitMb).toBe(128);
    expect(command.topicIds).toEqual([TOPIC_ID]);
    expect(command.tagIds).toEqual([TAG_ID]);
    expect(command.enabledLanguages.map((language) => language.value)).toEqual(['python', 'java']);
    expect(command.starterCodes[0]?.sourceCode).toBe('def solve(): pass');
    expect(command.functionContracts.get('python')?.functionName).toBe('solve');
    expect(command.oopContracts.get('java')?.name).toBe('Solution');
  });

  it('rejects duplicate function contract languages', () => {
    const dto = minimalCreateDto({
      functionContracts: [
        { language: 'python', functionName: 'a', parameters: [], returnType: 'void' },
        { language: 'python', functionName: 'b', parameters: [], returnType: 'void' },
      ],
    });

    expect(() => mapper.toCreateCommand(dto)).toThrow(DomainValidationError);
  });

  it('rejects duplicate OOP contract languages', () => {
    const dto = minimalCreateDto({
      oopContracts: [
        { language: 'python', structure: 'CLASS', name: 'A', methods: [] },
        { language: 'python', structure: 'CLASS', name: 'B', methods: [] },
      ],
    });

    expect(() => mapper.toCreateCommand(dto)).toThrow(DomainValidationError);
  });

  it('only includes fields present in an update request', () => {
    const command = mapper.toUpdateCommand({ title: 'Updated title' });

    expect(Object.keys(command)).toEqual(['title']);
    expect(command.title?.value).toBe('Updated title');
  });

  it('keeps explicit nulls for nullable update fields', () => {
    const command = mapper.toUpdateCommand({
      inputSpecification: null,
      outputSpecification: null,
      constraints: null,
    });

    expect(command.inputSpecification).toBeNull();
    expect(command.outputSpecification).toBeNull();
    expect(command.constraints).toBeNull();
  });

  it('keeps empty arrays to clear collections', () => {
    const command = mapper.toUpdateCommand({
      examples: [],
      topicIds: [],
      tagIds: [],
      enabledLanguages: [],
      starterCodes: [],
      functionContracts: [],
      oopContracts: [],
    });

    expect(command.examples).toEqual([]);
    expect(command.topicIds).toEqual([]);
    expect(command.tagIds).toEqual([]);
    expect(command.enabledLanguages).toEqual([]);
    expect(command.starterCodes).toEqual([]);
    expect(command.functionContracts?.size).toBe(0);
    expect(command.oopContracts?.size).toBe(0);
  });

  it('maps update contracts and references', () => {
    const command = mapper.toUpdateCommand({
      topicIds: [TOPIC_ID],
      tagIds: [TAG_ID],
      functionContracts: [
        {
          language: 'python',
          functionName: 'solve',
          parameters: [{ name: 'values', type: 'int[]' }],
          returnType: 'int',
        },
      ],
    });

    expect(command.topicIds).toEqual([TOPIC_ID]);
    expect(command.tagIds).toEqual([TAG_ID]);
    expect(command.functionContracts?.get('python')?.returnType).toBe('int');
  });

  it('applies test case defaults and maps reorder and harness requests', () => {
    const add = mapper.toAddTestCaseCommand({
      expectedOutput: '3',
      score: 5,
    });

    expect(add.input.value).toBe('');
    expect(add.visibility.value).toBe('HIDDEN');
    expect(add.displayOrder).toBeUndefined();

    const explicit = mapper.toAddTestCaseCommand({
      input: '1 2',
      expectedOutput: '3',
      visibility: 'SAMPLE',
      score: 5,
      displayOrder: 2,
    });

    expect(explicit.visibility?.value).toBe('SAMPLE');
    expect(explicit.displayOrder?.value).toBe(2);

    const reorder = mapper.toReorderTestCasesCommand({
      testCaseIds: [TOPIC_ID],
    });

    expect(reorder.testCaseIds[0]?.value).toBe(TOPIC_ID);

    const harness = mapper.toSetHarnessCommand('python', { source: 'def solve(): pass' });

    expect(harness.language).toBe('python');
    expect(harness.source.value).toBe('def solve(): pass');
  });

  it('returns an empty command for an empty update request', () => {
    expect(mapper.toUpdateCommand({})).toEqual({});
  });
});

function minimalCreateDto(
  overrides: Partial<CreateProblemRequestDto> = {},
): CreateProblemRequestDto {
  return {
    slug: 'two-sum',
    title: 'Two Sum',
    statement: 'Find two numbers.',
    problemType: 'STANDARD',
    difficulty: 'EASY',
    ...overrides,
  };
}
