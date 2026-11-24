import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ExecutionLimitsDto, VisibleExampleDto } from './content.dto';
import { CreateProblemRequestDto } from './create-problem.request.dto';
import { UpdateProblemRequestDto } from './update-problem.request.dto';

const VALID_CREATE = {
  title: 'Two Sum',
  statement:
    'Given an array of integers, return the indices of two numbers that add up to a target.',
  problemType: 'STANDARD',
  difficulty: 'EASY',
};

describe('CreateProblemRequestDto', () => {
  it('accepts a minimal valid payload', async () => {
    await expect(errorsOf(CreateProblemRequestDto, VALID_CREATE)).resolves.toEqual([]);
  });

  it.each(['', null])('rejects an explicit invalid slug %s', async (slug) => {
    await expect(errorsOf(CreateProblemRequestDto, { ...VALID_CREATE, slug })).resolves.toEqual([
      'slug',
    ]);
  });

  it('rejects missing required fields and invalid enum values', async () => {
    const missing = await errorsOf(CreateProblemRequestDto, {});
    const invalid = await errorsOf(CreateProblemRequestDto, {
      ...VALID_CREATE,
      slug: 'Not A Slug',
      problemType: 'UNKNOWN',
      difficulty: 'INSANE',
    });

    expect(missing).toEqual(['title', 'statement', 'problemType', 'difficulty']);
    expect(invalid).toEqual(expect.arrayContaining(['slug', 'problemType', 'difficulty']));
  });

  it('accepts null for nullable optional fields', async () => {
    const payload = {
      ...VALID_CREATE,
      inputSpecification: null,
      outputSpecification: null,
      constraints: null,
      examples: [{ input: 'nums = [2,7,11,15]', output: '[0,1]', explanation: null }],
    };

    await expect(errorsOf(CreateProblemRequestDto, payload)).resolves.toEqual([]);
  });

  it('coerces nested examples and execution limits', () => {
    const dto = plainToInstance(CreateProblemRequestDto, {
      ...VALID_CREATE,
      examples: [{ input: '1', output: '2' }],
      executionLimits: { timeLimitMs: '1000', memoryLimitMb: '256' },
    });

    expect(dto.examples?.[0]).toBeInstanceOf(VisibleExampleDto);
    expect(dto.executionLimits).toBeInstanceOf(ExecutionLimitsDto);
    expect(dto.executionLimits?.timeLimitMs).toBe(1000);
    expect(dto.executionLimits?.memoryLimitMb).toBe(256);
  });

  it('rejects duplicate languages, invalid UUIDs, and out-of-range limits', async () => {
    const errors = await errorsOf(CreateProblemRequestDto, {
      ...VALID_CREATE,
      enabledLanguages: ['java', 'java'],
      topicIds: ['not-a-uuid'],
      executionLimits: { timeLimitMs: 0, memoryLimitMb: 2048 },
    });

    expect(errors).toEqual(
      expect.arrayContaining(['enabledLanguages', 'topicIds', 'executionLimits']),
    );
  });

  it('enforces array size caps and nested contract validation', async () => {
    const examples = Array.from({ length: 51 }, (_, index) => ({
      input: `input-${index}`,
      output: `output-${index}`,
    }));
    const functionContracts = Array.from({ length: 21 }, () => ({
      language: 'java',
      functionName: 'solve',
      parameters: [],
      returnType: 'int',
    }));
    const errors = await errorsOf(CreateProblemRequestDto, {
      ...VALID_CREATE,
      examples,
      functionContracts,
    });

    expect(errors).toEqual(expect.arrayContaining(['examples', 'functionContracts']));
    await expect(
      errorsOf(CreateProblemRequestDto, {
        ...VALID_CREATE,
        functionContracts: [
          { language: 'java', functionName: 'solve', parameters: [{ name: 'n', type: 'int' }] },
        ],
      }),
    ).resolves.toContain('functionContracts');
  });

  it('allows a null OOP constructor but rejects invalid OOP members', async () => {
    const validOop = {
      language: 'python',
      structure: 'CLASS',
      name: 'Solution',
      constructorContract: null,
      methods: [{ name: 'solve', access: 'PUBLIC', parameters: [], returnType: 'int' }],
    };

    await expect(
      errorsOf(CreateProblemRequestDto, { ...VALID_CREATE, oopContracts: [validOop] }),
    ).resolves.toEqual([]);
    await expect(
      errorsOf(CreateProblemRequestDto, {
        ...VALID_CREATE,
        oopContracts: [
          {
            ...validOop,
            methods: [{ name: 'solve', access: 'FRIEND', parameters: [], returnType: 'int' }],
          },
        ],
      }),
    ).resolves.toContain('oopContracts');
  });
});

describe('UpdateProblemRequestDto', () => {
  it('accepts an empty patch', async () => {
    await expect(errorsOf(UpdateProblemRequestDto, {})).resolves.toEqual([]);
  });

  it('validates provided fields and keeps nullable fields optional', async () => {
    await expect(errorsOf(UpdateProblemRequestDto, { title: '' })).resolves.toContain('title');
    await expect(
      errorsOf(UpdateProblemRequestDto, {
        inputSpecification: null,
        outputSpecification: null,
        constraints: null,
      }),
    ).resolves.toEqual([]);
  });
});

async function errorsOf(
  type: new () => object,
  payload: Record<string, unknown>,
): Promise<string[]> {
  const errors = await validate(plainToInstance(type, payload));

  return errors.map((error) => error.property);
}
