import { ConcurrentModificationError } from '@learning/modules/problems/application/errors/concurrent-modification.error';
import { ProblemNotFoundError } from '@learning/modules/problems/application/errors/problem-not-found.error';
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

import { RestoreProblemUseCase } from './restore-problem.use-case';

const PRINCIPAL = {
  userId: TEST_USER_ID,
  roles: ['ADMIN'],
  permissions: ['problem:restore'],
};

describe('RestoreProblemUseCase', () => {
  it('restores a deleted problem and returns the managed detail', async () => {
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
    const problem = deletedProblem();
    const readiness = { ready: true, issues: [] };
    const detail = { id: problem.id.value };

    repository.findByIdIncludingDeleted.mockResolvedValue(problem);
    repository.restore.mockResolvedValue(true);
    repository.isSlugAvailable.mockResolvedValue(true);
    publishValidator.validate.mockReturnValue(readiness);
    resultMapper.toManagedDetail.mockResolvedValue(detail);

    await expect(useCase.execute(PRINCIPAL, problem.id.value)).resolves.toBe(detail);

    expect(problem.deletedAt).toBeNull();
    expect(repository.restore).toHaveBeenCalledWith(problem.id.value, expect.any(Date));
    expect(resultMapper.toManagedDetail).toHaveBeenCalledWith(problem, readiness, []);
  });

  it('throws when the problem does not exist', async () => {
    const repository = repositoryMock();
    const authorization = authorizationMock();
    const useCase = createUseCase({ repository, authorization });

    repository.findByIdIncludingDeleted.mockResolvedValue(null);

    await expect(useCase.execute(PRINCIPAL, 'missing')).rejects.toBeInstanceOf(
      ProblemNotFoundError,
    );
    expect(authorization.requireManaged).not.toHaveBeenCalled();
  });

  it('reports a concurrent modification when the restore loses the race', async () => {
    const repository = repositoryMock();
    const useCase = createUseCase({ repository });
    const problem = deletedProblem();

    repository.findByIdIncludingDeleted.mockResolvedValue(problem);
    repository.restore.mockResolvedValue(false);
    repository.findByIdIncludingDeleted
      .mockResolvedValueOnce(problem)
      .mockResolvedValueOnce(deletedProblem());

    await expect(useCase.execute(PRINCIPAL, problem.id.value)).rejects.toBeInstanceOf(
      ConcurrentModificationError,
    );
  });

  it('reports not found when the row disappeared during restore', async () => {
    const repository = repositoryMock();
    const useCase = createUseCase({ repository });
    const problem = deletedProblem();

    repository.findByIdIncludingDeleted.mockResolvedValueOnce(problem).mockResolvedValueOnce(null);
    repository.restore.mockResolvedValue(false);

    await expect(useCase.execute(PRINCIPAL, problem.id.value)).rejects.toBeInstanceOf(
      ProblemNotFoundError,
    );
  });

  it('rejects restoring a problem that is not deleted', async () => {
    const repository = repositoryMock();
    const useCase = createUseCase({ repository });
    const problem = buildProblem();

    repository.findByIdIncludingDeleted.mockResolvedValue(problem);

    await expect(useCase.execute(PRINCIPAL, problem.id.value)).rejects.toMatchObject({
      code: 'INVALID_PROBLEM_STATE',
    });
    expect(repository.restore).not.toHaveBeenCalled();
  });
});

function deletedProblem() {
  const problem = buildProblem();

  problem.publish(TEST_NOW);
  problem.softDelete(TEST_NOW);

  return problem;
}

function createUseCase(dependencies: {
  authorization?: ReturnType<typeof authorizationMock>;
  repository?: ReturnType<typeof repositoryMock>;
  testCaseRepository?: ReturnType<typeof testCaseRepositoryMock>;
  publishValidator?: ReturnType<typeof publishValidatorMock>;
  transactionRunner?: ReturnType<typeof transactionRunnerMock>;
  resultMapper?: ReturnType<typeof resultMapperMock>;
}): RestoreProblemUseCase {
  const {
    authorization = authorizationMock(),
    repository = repositoryMock(),
    testCaseRepository = testCaseRepositoryMock(),
    publishValidator = publishValidatorMock(),
    transactionRunner = transactionRunnerMock(),
    resultMapper = resultMapperMock(),
  } = dependencies;

  return new RestoreProblemUseCase(
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
    save: jest.fn(),
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
