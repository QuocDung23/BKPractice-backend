import type { CreateProblemCommand } from '@learning/modules/problems/application/command/create-problem.command';
import { UnknownReferenceError } from '@learning/modules/problems/application/errors/unknown-reference.error';
import type { TransactionRunner } from '@learning/modules/problems/application/ports/out/transaction-runner.port.out';
import type { ProblemResultMapper } from '@learning/modules/problems/application/results/problem-result.mapper';
import type { ProblemAuthorizationService } from '@learning/modules/problems/application/services/problem-authorization.service';
import { DuplicateSlugError } from '@learning/modules/problems/domain/errors/duplicate-slug.error';
import { Problem } from '@learning/modules/problems/domain/problem.aggregate';
import type { ContentFormatValidator } from '@learning/modules/problems/domain/services/content-format.validator';
import type { PublishValidator } from '@learning/modules/problems/domain/services/publish.validator';
import {
  TEST_PROBLEM_ID,
  TEST_USER_ID,
} from '@learning/modules/problems/domain/testing/problem-test.factory';
import {
  ExecutionLimits,
  ProblemStatement,
  ProblemTitle,
  Slug,
} from '@learning/modules/problems/domain/value-objects';
import { TestSuiteSummary } from '@learning/modules/problems/domain/value-objects';

import { CreateProblemUseCase } from './create-problem.use-case';

const PRINCIPAL = { userId: TEST_USER_ID, roles: ['ADMIN'], permissions: ['problem:create'] };

describe('CreateProblemUseCase', () => {
  it('creates and saves a draft problem and returns the managed detail', async () => {
    const authorization = authorizationMock();
    const topicTagReader = topicTagReaderMock();
    const repository = repositoryMock();
    const contentValidator = { assertSafe: jest.fn() };
    const publishValidator = { validate: jest.fn().mockReturnValue({ ready: true, issues: [] }) };
    const transactionRunner = transactionRunnerMock();
    const resultMapper = resultMapperMock();
    const useCase = createUseCase({
      authorization,
      topicTagReader,
      repository,
      contentValidator,
      publishValidator,
      transactionRunner,
      resultMapper,
    });

    repository.isSlugAvailable.mockResolvedValue(true);
    repository.save.mockResolvedValue(undefined);
    resultMapper.toManagedDetail.mockResolvedValue({ id: TEST_PROBLEM_ID });

    await expect(useCase.execute(PRINCIPAL, command())).resolves.toEqual({ id: TEST_PROBLEM_ID });

    const savedCall = repository.save.mock.calls[0] as [Problem] | undefined;
    const saved = savedCall?.[0];

    expect(saved).toBeInstanceOf(Problem);
    expect(saved?.title.value).toBe('Two Sum');
    expect(saved?.publishStatus).toBe('DRAFT');
    expect(saved?.createdBy.value).toBe(TEST_USER_ID);
    expect(contentValidator.assertSafe).toHaveBeenCalledWith(saved);
    expect(publishValidator.validate).toHaveBeenCalledWith(saved, { slugAvailable: true });
    expect(transactionRunner.run).toHaveBeenCalledTimes(1);
    expect(resultMapper.toManagedDetail).toHaveBeenCalledWith(
      saved,
      expect.objectContaining({ ready: true }),
    );
  });

  it('rejects unknown topic and tag references before creating the problem', async () => {
    const topicTagReader = topicTagReaderMock();
    const repository = repositoryMock();
    const useCase = createUseCase({ topicTagReader, repository });

    topicTagReader.findMissingTopicIds.mockResolvedValue(['missing-topic']);
    topicTagReader.findMissingTagIds.mockResolvedValue(['missing-tag']);

    await expect(
      useCase.execute(PRINCIPAL, command({ topicIds: ['missing-topic'], tagIds: ['missing-tag'] })),
    ).rejects.toBeInstanceOf(UnknownReferenceError);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rejects a duplicate slug before creating the problem', async () => {
    const repository = repositoryMock();
    const useCase = createUseCase({ repository });

    repository.isSlugAvailable.mockResolvedValue(false);

    await expect(useCase.execute(PRINCIPAL, command())).rejects.toBeInstanceOf(DuplicateSlugError);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('propagates authorization failures without touching the repository', async () => {
    const authorization = authorizationMock();
    const repository = repositoryMock();
    const useCase = createUseCase({ authorization, repository });

    authorization.requireCreate.mockImplementation(() => {
      throw new Error('forbidden');
    });

    await expect(useCase.execute(PRINCIPAL, command())).rejects.toThrow('forbidden');
    expect(repository.isSlugAvailable).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });
});

function createUseCase(dependencies: {
  authorization?: ReturnType<typeof authorizationMock>;
  topicTagReader?: ReturnType<typeof topicTagReaderMock>;
  repository?: ReturnType<typeof repositoryMock>;
  contentValidator?: { assertSafe: jest.Mock };
  publishValidator?: { validate: jest.Mock };
  transactionRunner?: ReturnType<typeof transactionRunnerMock>;
  resultMapper?: ReturnType<typeof resultMapperMock>;
}): CreateProblemUseCase {
  const {
    authorization = authorizationMock(),
    topicTagReader = topicTagReaderMock(),
    repository = repositoryMock(),
    contentValidator = { assertSafe: jest.fn() },
    publishValidator = { validate: jest.fn().mockReturnValue({ ready: true, issues: [] }) },
    transactionRunner = transactionRunnerMock(),
    resultMapper = resultMapperMock(),
  } = dependencies;

  return new CreateProblemUseCase(
    authorization as unknown as ProblemAuthorizationService,
    topicTagReader,
    repository,
    contentValidator as unknown as ContentFormatValidator,
    publishValidator as unknown as PublishValidator,
    transactionRunner as unknown as TransactionRunner,
    resultMapper as unknown as ProblemResultMapper,
  );
}

function command(overrides: Partial<CreateProblemCommand> = {}): CreateProblemCommand {
  return {
    slug: new Slug('two-sum'),
    title: new ProblemTitle('Two Sum'),
    statement: new ProblemStatement('Given an array, return the indices of two numbers.'),
    inputSpecification: null,
    outputSpecification: null,
    problemType: 'STANDARD',
    difficulty: 'EASY',
    examples: [],
    constraints: null,
    executionLimits: new ExecutionLimits({ timeLimitMs: 1_000, memoryLimitMb: 256 }),
    topicIds: [],
    tagIds: [],
    enabledLanguages: [],
    starterCodes: [],
    functionContracts: new Map(),
    oopContracts: new Map(),
    ...overrides,
  };
}

function authorizationMock() {
  return {
    requireCreate: jest.fn(),
    requireManagedList: jest.fn(),
    requireManaged: jest.fn(),
  };
}

function topicTagReaderMock() {
  return {
    findMissingTopicIds: jest.fn().mockResolvedValue([]),
    findMissingTagIds: jest.fn().mockResolvedValue([]),
    findTopicNames: jest.fn(),
    findTagNames: jest.fn(),
    listTopics: jest.fn().mockResolvedValue([]),
  };
}

function repositoryMock() {
  return {
    findById: jest.fn(),
    loadForUpdate: jest.fn(),
    loadTestSuiteSummary: jest.fn().mockResolvedValue(TestSuiteSummary.empty()),
    loadTestSuiteSummaries: jest.fn().mockResolvedValue(new Map()),
    findByIdIncludingDeleted: jest.fn(),
    findPublishedByIdOrSlug: jest.fn(),
    findManagedById: jest.fn(),
    listPublished: jest.fn(),
    listManaged: jest.fn(),
    isSlugAvailable: jest.fn(),
    save: jest.fn(),
    softDelete: jest.fn(),
    restore: jest.fn(),
  };
}

function transactionRunnerMock() {
  return { run: jest.fn((work: () => Promise<unknown>) => work()) };
}

function resultMapperMock() {
  return {
    toSummary: jest.fn(),
    toDetail: jest.fn(),
    toManagedSummary: jest.fn(),
    toManagedDetail: jest.fn(),
    toPage: jest.fn(),
    toManagedPage: jest.fn(),
  };
}
