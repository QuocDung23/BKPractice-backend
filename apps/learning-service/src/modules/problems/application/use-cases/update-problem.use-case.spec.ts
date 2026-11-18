import { ProblemNotFoundError } from '@learning/modules/problems/application/errors/problem-not-found.error';
import { PublishNotReadyError } from '@learning/modules/problems/application/errors/publish-not-ready.error';
import { UnknownReferenceError } from '@learning/modules/problems/application/errors/unknown-reference.error';
import type { TransactionRunner } from '@learning/modules/problems/application/ports/out/transaction-runner.port.out';
import type { ProblemResultMapper } from '@learning/modules/problems/application/results/problem-result.mapper';
import type { ProblemAuthorizationService } from '@learning/modules/problems/application/services/problem-authorization.service';
import { DomainValidationError } from '@learning/modules/problems/domain/errors/domain-validation.error';
import type { TestCaseRepository } from '@learning/modules/problems/domain/repositories/test-case.repository.port.out';
import type { ContentFormatValidator } from '@learning/modules/problems/domain/services/content-format.validator';
import { ProblemContractValidator } from '@learning/modules/problems/domain/services/problem-contract.validator';
import { PublishValidator } from '@learning/modules/problems/domain/services/publish.validator';
import {
  TEST_NOW,
  TEST_USER_ID,
  buildProblem,
  languages,
} from '@learning/modules/problems/domain/testing/problem-test.factory';
import {
  MAX_TEST_SUITE_BYTES,
  ProblemTitle,
  TestSuiteSummary,
} from '@learning/modules/problems/domain/value-objects';

import { UpdateProblemUseCase } from './update-problem.use-case';

const PRINCIPAL = {
  userId: TEST_USER_ID,
  roles: ['ADMIN'],
  permissions: ['problem:update'],
};

describe('UpdateProblemUseCase', () => {
  it('updates a draft, saves it optimistically and returns the managed detail', async () => {
    const repository = repositoryMock();
    const topicTagReader = topicTagReaderMock();
    const contentValidator = contentValidatorMock();
    const transactionRunner = transactionRunnerMock();
    const resultMapper = resultMapperMock();
    const useCase = createUseCase({
      repository,
      topicTagReader,
      contentValidator,
      transactionRunner,
      resultMapper,
    });
    const problem = buildProblem();
    const expectedUpdatedAt = problem.updatedAt;
    const detail = { id: problem.id.value };

    repository.loadForUpdate.mockResolvedValue(problem);
    resultMapper.toManagedDetail.mockResolvedValue(detail);

    await expect(
      useCase.execute(PRINCIPAL, problem.id.value, { title: new ProblemTitle('Updated title') }),
    ).resolves.toBe(detail);

    expect(problem.title.value).toBe('Updated title');
    expect(contentValidator.assertSafe).toHaveBeenCalledWith(problem);
    expect(repository.save).toHaveBeenCalledWith(problem, expectedUpdatedAt);
    expect(topicTagReader.findMissingTopicIds).not.toHaveBeenCalled();
  });

  it('clears a nullable field when the command explicitly passes null', async () => {
    const repository = repositoryMock();
    const useCase = createUseCase({ repository });
    const problem = buildProblem();

    expect(problem.inputSpecification).not.toBeNull();
    repository.loadForUpdate.mockResolvedValue(problem);

    await useCase.execute(PRINCIPAL, problem.id.value, { inputSpecification: null });

    expect(problem.inputSpecification).toBeNull();
  });

  it('throws when the problem does not exist', async () => {
    const repository = repositoryMock();
    const authorization = authorizationMock();
    const useCase = createUseCase({ repository, authorization });

    repository.loadForUpdate.mockResolvedValue(null);

    await expect(useCase.execute(PRINCIPAL, 'missing', {})).rejects.toBeInstanceOf(
      ProblemNotFoundError,
    );
    expect(authorization.requireManaged).not.toHaveBeenCalled();
  });

  it('rejects updating a problem on hold', async () => {
    const repository = repositoryMock();
    const useCase = createUseCase({ repository });
    const problem = buildProblem();

    problem.publish(TEST_NOW);
    problem.hold(TEST_NOW);
    repository.loadForUpdate.mockResolvedValue(problem);

    await expect(
      useCase.execute(PRINCIPAL, problem.id.value, { title: new ProblemTitle('Updated') }),
    ).rejects.toMatchObject({ code: 'INVALID_PROBLEM_STATE' });
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rejects changing the problem type outside a draft', async () => {
    const repository = repositoryMock();
    const useCase = createUseCase({ repository });
    const problem = buildProblem();

    problem.publish(TEST_NOW);
    repository.loadForUpdate.mockResolvedValue(problem);

    await expect(
      useCase.execute(PRINCIPAL, problem.id.value, { problemType: 'FUNCTION' }),
    ).rejects.toMatchObject({ code: 'INVALID_PROBLEM_STATE' });
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rejects unknown topic and tag references', async () => {
    const repository = repositoryMock();
    const topicTagReader = topicTagReaderMock();
    const useCase = createUseCase({ repository, topicTagReader });
    const problem = buildProblem();

    repository.loadForUpdate.mockResolvedValue(problem);
    topicTagReader.findMissingTopicIds.mockResolvedValue(['missing-topic']);
    topicTagReader.findMissingTagIds.mockResolvedValue(['missing-tag']);

    await expect(
      useCase.execute(PRINCIPAL, problem.id.value, {
        topicIds: ['missing-topic'],
        tagIds: ['missing-tag'],
      }),
    ).rejects.toBeInstanceOf(UnknownReferenceError);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rejects a published update that makes the problem not ready', async () => {
    const repository = repositoryMock();
    const publishValidator = publishValidatorMock();
    const useCase = createUseCase({ repository, publishValidator });
    const problem = buildProblem();

    problem.publish(TEST_NOW);
    repository.loadForUpdate.mockResolvedValue(problem);
    publishValidator.validate.mockReturnValue({
      ready: false,
      issues: [{ code: 'ENABLED_LANGUAGE_REQUIRED', message: 'no language' }],
    });

    await expect(
      useCase.execute(PRINCIPAL, problem.id.value, { title: new ProblemTitle('Updated') }),
    ).rejects.toBeInstanceOf(PublishNotReadyError);
  });

  it('rejects enabling a FUNCTION language on a published problem without a harness', async () => {
    const repository = repositoryMock();
    const publishValidator = new PublishValidator(new ProblemContractValidator());
    const useCase = createUseCase({ repository, publishValidator });
    const problem = buildProblem({
      problemType: 'FUNCTION',
      inputSpecification: null,
      outputSpecification: null,
      enabledLanguages: languages('python'),
    });

    problem.publish(TEST_NOW);
    repository.loadForUpdate.mockResolvedValue(problem);

    await expect(
      useCase.execute(PRINCIPAL, problem.id.value, {
        enabledLanguages: languages('python', 'java'),
      }),
    ).rejects.toBeInstanceOf(PublishNotReadyError);
  });

  it('validates readiness against the saved summary so a staged harness counts', async () => {
    const repository = repositoryMock();
    const publishValidator = publishValidatorMock();
    const useCase = createUseCase({ repository, publishValidator });
    const problem = buildProblem({
      problemType: 'FUNCTION',
      inputSpecification: null,
      outputSpecification: null,
      enabledLanguages: languages('python'),
    });
    const summaryOf = (harnessLanguages: ('java' | 'python')[]) =>
      new TestSuiteSummary({
        totalCount: 1,
        hiddenCount: 1,
        totalScore: 1,
        totalBytes: 10 * harnessLanguages.length,
        harnessLanguages,
      });
    let validatedWithJavaHarness = false;

    publishValidator.validate.mockImplementation((candidate: typeof problem) => {
      validatedWithJavaHarness = candidate.testSuiteSummary?.hasHarness('java') ?? false;

      return { ready: true, issues: [] };
    });
    problem.publish(TEST_NOW);
    repository.loadForUpdate.mockResolvedValue(problem);
    repository.loadTestSuiteSummary
      .mockResolvedValueOnce(summaryOf(['python']))
      .mockResolvedValueOnce(summaryOf(['java', 'python']));

    await useCase.execute(PRINCIPAL, problem.id.value, {
      enabledLanguages: languages('python', 'java'),
    });

    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(validatedWithJavaHarness).toBe(true);
  });

  it('rejects an update that grows the suite beyond the size limit', async () => {
    const repository = repositoryMock();
    const useCase = createUseCase({ repository });
    const problem = buildProblem();
    const oversized = TestSuiteSummary.fromStored({
      totalCount: 0,
      hiddenCount: 0,
      totalScore: 0,
      totalBytes: MAX_TEST_SUITE_BYTES + 1,
    });

    repository.loadForUpdate.mockResolvedValue(problem);
    repository.loadTestSuiteSummary
      .mockResolvedValueOnce(TestSuiteSummary.empty())
      .mockResolvedValueOnce(oversized);

    await expect(
      useCase.execute(PRINCIPAL, problem.id.value, { title: new ProblemTitle('Updated') }),
    ).rejects.toBeInstanceOf(DomainValidationError);
  });

  it('saves a published update that remains ready and validates the saved state', async () => {
    const repository = repositoryMock();
    const publishValidator = publishValidatorMock();
    const resultMapper = resultMapperMock();
    const useCase = createUseCase({ repository, publishValidator, resultMapper });
    const problem = buildProblem();

    problem.publish(TEST_NOW);
    repository.loadForUpdate.mockResolvedValue(problem);

    await useCase.execute(PRINCIPAL, problem.id.value, { title: new ProblemTitle('Updated') });

    expect(publishValidator.validate).toHaveBeenCalledTimes(1);
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(resultMapper.toManagedDetail).toHaveBeenCalledWith(
      problem,
      expect.objectContaining({ ready: true }),
      [],
    );
  });
});

function createUseCase(dependencies: {
  authorization?: ReturnType<typeof authorizationMock>;
  topicTagReader?: ReturnType<typeof topicTagReaderMock>;
  repository?: ReturnType<typeof repositoryMock>;
  testCaseRepository?: ReturnType<typeof testCaseRepositoryMock>;
  contentValidator?: ReturnType<typeof contentValidatorMock>;
  publishValidator?: Pick<PublishValidator, 'validate'>;
  transactionRunner?: ReturnType<typeof transactionRunnerMock>;
  resultMapper?: ReturnType<typeof resultMapperMock>;
}): UpdateProblemUseCase {
  const {
    authorization = authorizationMock(),
    topicTagReader = topicTagReaderMock(),
    repository = repositoryMock(),
    testCaseRepository = testCaseRepositoryMock(),
    contentValidator = contentValidatorMock(),
    publishValidator = publishValidatorMock(),
    transactionRunner = transactionRunnerMock(),
    resultMapper = resultMapperMock(),
  } = dependencies;

  return new UpdateProblemUseCase(
    authorization as unknown as ProblemAuthorizationService,
    topicTagReader,
    repository,
    testCaseRepository as unknown as TestCaseRepository,
    contentValidator as unknown as ContentFormatValidator,
    publishValidator as unknown as PublishValidator,
    transactionRunner as unknown as TransactionRunner,
    resultMapper as unknown as ProblemResultMapper,
  );
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
    save: jest.fn().mockResolvedValue(undefined),
    softDelete: jest.fn(),
    restore: jest.fn(),
  };
}

function contentValidatorMock() {
  return { assertSafe: jest.fn() };
}

function publishValidatorMock() {
  return { validate: jest.fn().mockReturnValue({ ready: true, issues: [] }) };
}

function transactionRunnerMock() {
  return { run: jest.fn((work: () => Promise<unknown>) => work()) };
}

function resultMapperMock() {
  return {
    toSummary: jest.fn(),
    toDetail: jest.fn(),
    toManagedSummary: jest.fn(),
    toManagedDetail: jest.fn().mockResolvedValue({ id: 'problem' }),
    toPage: jest.fn(),
    toManagedPage: jest.fn(),
  };
}

function testCaseRepositoryMock() {
  return { listSamples: jest.fn().mockResolvedValue([]) };
}
