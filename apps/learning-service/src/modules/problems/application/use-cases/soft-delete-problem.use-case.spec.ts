import { ConcurrentModificationError } from '@learning/modules/problems/application/errors/concurrent-modification.error';
import { ProblemInPublishedCourseError } from '@learning/modules/problems/application/errors/problem-in-published-course.error';
import { ProblemNotFoundError } from '@learning/modules/problems/application/errors/problem-not-found.error';
import type { TransactionRunner } from '@learning/modules/problems/application/ports/out/transaction-runner.port.out';
import type { ProblemAuthorizationService } from '@learning/modules/problems/application/services/problem-authorization.service';
import {
  TEST_NOW,
  TEST_USER_ID,
  buildProblem,
} from '@learning/modules/problems/domain/testing/problem-test.factory';
import { TestSuiteSummary } from '@learning/modules/problems/domain/value-objects';

import { SoftDeleteProblemUseCase } from './soft-delete-problem.use-case';

const PRINCIPAL = {
  userId: TEST_USER_ID,
  roles: ['ADMIN'],
  permissions: ['problem:delete'],
};

describe('SoftDeleteProblemUseCase', () => {
  it('soft-deletes a published problem and returns the deletion result', async () => {
    const repository = repositoryMock();
    const transactionRunner = transactionRunnerMock();
    const useCase = createUseCase({ repository, transactionRunner });
    const problem = buildProblem();

    problem.publish(TEST_NOW);
    repository.findById.mockResolvedValue(problem);
    repository.softDelete.mockResolvedValue(true);

    const result = await useCase.execute(PRINCIPAL, problem.id.value);

    expect(result).toEqual({
      id: problem.id.value,
      publishStatus: 'PUBLISHED',
      deletedAt: problem.deletedAt,
    });
    expect(repository.softDelete).toHaveBeenCalledWith(problem.id.value, expect.any(Date));
    expect(transactionRunner.run).toHaveBeenCalledTimes(1);
  });

  it('rejects deleting a problem that belongs to a published course', async () => {
    const repository = repositoryMock();
    const useCase = createUseCase({ repository });
    const problem = buildProblem();

    problem.publish(TEST_NOW);
    repository.findById.mockResolvedValue(problem);
    repository.isUsedByPublishedCourse.mockResolvedValue(true);

    await expect(useCase.execute(PRINCIPAL, problem.id.value)).rejects.toBeInstanceOf(
      ProblemInPublishedCourseError,
    );
    expect(repository.softDelete).not.toHaveBeenCalled();
  });

  it('throws when the problem does not exist', async () => {
    const repository = repositoryMock();
    const authorization = authorizationMock();
    const useCase = createUseCase({ repository, authorization });

    repository.findById.mockResolvedValue(null);

    await expect(useCase.execute(PRINCIPAL, 'missing')).rejects.toBeInstanceOf(
      ProblemNotFoundError,
    );
    expect(authorization.requireManaged).not.toHaveBeenCalled();
  });

  it('rejects deleting a draft problem', async () => {
    const repository = repositoryMock();
    const useCase = createUseCase({ repository });
    const problem = buildProblem();

    repository.findById.mockResolvedValue(problem);

    await expect(useCase.execute(PRINCIPAL, problem.id.value)).rejects.toMatchObject({
      code: 'INVALID_PROBLEM_STATE',
    });
    expect(repository.softDelete).not.toHaveBeenCalled();
  });

  it('reports a concurrent modification when the row is already deleted', async () => {
    const repository = repositoryMock();
    const useCase = createUseCase({ repository });
    const problem = buildProblem();
    const current = buildProblem();

    problem.publish(TEST_NOW);
    current.publish(TEST_NOW);
    current.softDelete(TEST_NOW);
    repository.findById.mockResolvedValue(problem);
    repository.softDelete.mockResolvedValue(false);
    repository.findByIdIncludingDeleted.mockResolvedValue(current);

    await expect(useCase.execute(PRINCIPAL, problem.id.value)).rejects.toBeInstanceOf(
      ConcurrentModificationError,
    );
  });

  it('reports not found when the row disappeared during deletion', async () => {
    const repository = repositoryMock();
    const useCase = createUseCase({ repository });
    const problem = buildProblem();

    problem.publish(TEST_NOW);
    repository.findById.mockResolvedValue(problem);
    repository.softDelete.mockResolvedValue(false);
    repository.findByIdIncludingDeleted.mockResolvedValue(null);

    await expect(useCase.execute(PRINCIPAL, problem.id.value)).rejects.toBeInstanceOf(
      ProblemNotFoundError,
    );
  });
});

function createUseCase(dependencies: {
  authorization?: ReturnType<typeof authorizationMock>;
  repository?: ReturnType<typeof repositoryMock>;
  transactionRunner?: ReturnType<typeof transactionRunnerMock>;
}): SoftDeleteProblemUseCase {
  const {
    authorization = authorizationMock(),
    repository = repositoryMock(),
    transactionRunner = transactionRunnerMock(),
  } = dependencies;

  return new SoftDeleteProblemUseCase(
    authorization as unknown as ProblemAuthorizationService,
    repository,
    transactionRunner as unknown as TransactionRunner,
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
    isSlugAvailable: jest.fn(),
    save: jest.fn(),
    softDelete: jest.fn(),
    isUsedByPublishedCourse: jest.fn(),
    restore: jest.fn(),
  };
}

function transactionRunnerMock() {
  return { run: jest.fn((work: () => Promise<unknown>) => work()) };
}
