import { ProblemNotFoundError } from '@learning/modules/problems/application/errors/problem-not-found.error';
import { PublishNotReadyError } from '@learning/modules/problems/application/errors/publish-not-ready.error';
import type { TransactionRunner } from '@learning/modules/problems/application/ports/out/transaction-runner.port.out';
import type { ProblemResultMapper } from '@learning/modules/problems/application/results/problem-result.mapper';
import type { ProblemAuthorizationService } from '@learning/modules/problems/application/services/problem-authorization.service';
import type { TestCaseRepository } from '@learning/modules/problems/domain/repositories/test-case.repository.port.out';
import type { PublishValidator } from '@learning/modules/problems/domain/services/publish.validator';
import {
  TEST_NOW,
  TEST_USER_ID,
  buildProblem,
} from '@learning/modules/problems/domain/testing/problem-test.factory';
import { TestSuiteSummary } from '@learning/modules/problems/domain/value-objects';

import { RepublishProblemUseCase } from './republish-problem.use-case';

const PRINCIPAL = {
  userId: TEST_USER_ID,
  roles: ['ADMIN'],
  permissions: ['problem:republish'],
};

describe('RepublishProblemUseCase', () => {
  it('republishes an on-hold problem and saves it', async () => {
    const repository = repositoryMock();
    const publishValidator = publishValidatorMock();
    const transactionRunner = transactionRunnerMock();
    const resultMapper = resultMapperMock();
    const useCase = createUseCase({
      repository,
      publishValidator,
      transactionRunner,
      resultMapper,
    });
    const problem = buildProblem();

    problem.publish(TEST_NOW);
    problem.hold(TEST_NOW);
    const expectedUpdatedAt = problem.updatedAt;
    const detail = { id: problem.id.value };

    repository.loadForUpdate.mockResolvedValue(problem);
    repository.isSlugAvailable.mockResolvedValue(true);
    resultMapper.toManagedDetail.mockResolvedValue(detail);

    await expect(useCase.execute(PRINCIPAL, problem.id.value)).resolves.toBe(detail);

    expect(problem.publishStatus).toBe('PUBLISHED');
    expect(repository.isSlugAvailable).toHaveBeenCalledWith(problem.slug.value, problem.id.value);
    expect(repository.save).toHaveBeenCalledWith(problem, expectedUpdatedAt);
  });

  it('throws when the problem does not exist', async () => {
    const repository = repositoryMock();
    const authorization = authorizationMock();
    const useCase = createUseCase({ repository, authorization });

    repository.loadForUpdate.mockResolvedValue(null);

    await expect(useCase.execute(PRINCIPAL, 'missing')).rejects.toBeInstanceOf(
      ProblemNotFoundError,
    );
    expect(authorization.requireManaged).not.toHaveBeenCalled();
  });

  it('rejects republishing when readiness checks fail', async () => {
    const repository = repositoryMock();
    const publishValidator = publishValidatorMock();
    const useCase = createUseCase({ repository, publishValidator });
    const problem = buildProblem();

    problem.publish(TEST_NOW);
    problem.hold(TEST_NOW);
    repository.loadForUpdate.mockResolvedValue(problem);
    repository.isSlugAvailable.mockResolvedValue(false);
    publishValidator.validate.mockReturnValue({
      ready: false,
      issues: [{ code: 'SLUG_TAKEN', field: 'slug', message: 'taken' }],
    });

    await expect(useCase.execute(PRINCIPAL, problem.id.value)).rejects.toBeInstanceOf(
      PublishNotReadyError,
    );
    expect(problem.publishStatus).toBe('ON_HOLD');
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rejects republishing a draft problem', async () => {
    const repository = repositoryMock();
    const useCase = createUseCase({ repository });
    const problem = buildProblem();

    repository.loadForUpdate.mockResolvedValue(problem);

    await expect(useCase.execute(PRINCIPAL, problem.id.value)).rejects.toMatchObject({
      code: 'INVALID_PROBLEM_STATE',
    });
    expect(repository.save).not.toHaveBeenCalled();
  });
});

function createUseCase(dependencies: {
  authorization?: ReturnType<typeof authorizationMock>;
  repository?: ReturnType<typeof repositoryMock>;
  testCaseRepository?: ReturnType<typeof testCaseRepositoryMock>;
  publishValidator?: ReturnType<typeof publishValidatorMock>;
  transactionRunner?: ReturnType<typeof transactionRunnerMock>;
  resultMapper?: ReturnType<typeof resultMapperMock>;
}): RepublishProblemUseCase {
  const {
    authorization = authorizationMock(),
    repository = repositoryMock(),
    testCaseRepository = testCaseRepositoryMock(),
    publishValidator = publishValidatorMock(),
    transactionRunner = transactionRunnerMock(),
    resultMapper = resultMapperMock(),
  } = dependencies;

  return new RepublishProblemUseCase(
    authorization as unknown as ProblemAuthorizationService,
    repository,
    testCaseRepository as unknown as TestCaseRepository,
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
    isSlugAvailable: jest.fn().mockResolvedValue(true),
    save: jest.fn().mockResolvedValue(undefined),
    softDelete: jest.fn(),
    isUsedByPublishedCourse: jest.fn(),
    restore: jest.fn(),
  };
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
