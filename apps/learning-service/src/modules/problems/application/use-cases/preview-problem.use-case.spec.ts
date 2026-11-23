import { ProblemNotFoundError } from '@learning/modules/problems/application/errors/problem-not-found.error';
import type { ProblemResultMapper } from '@learning/modules/problems/application/results/problem-result.mapper';
import type { ProblemAuthorizationService } from '@learning/modules/problems/application/services/problem-authorization.service';
import type { TestCaseRepository } from '@learning/modules/problems/domain/repositories/test-case.repository.port.out';
import type { PublishValidator } from '@learning/modules/problems/domain/services/publish.validator';
import {
  TEST_NOW,
  buildProblem,
} from '@learning/modules/problems/domain/testing/problem-test.factory';
import { TestSuiteSummary } from '@learning/modules/problems/domain/value-objects';

import { PreviewProblemUseCase } from './preview-problem.use-case';

const PRINCIPAL = { userId: 'user-1', roles: ['ADMIN'], permissions: ['problem:read-managed'] };

describe('PreviewProblemUseCase', () => {
  it('returns a managed detail for a deleted problem without mutating it', async () => {
    const repository = repositoryMock();
    const testCaseRepository = testCaseRepositoryMock();
    const publishValidator = publishValidatorMock();
    const resultMapper = resultMapperMock();
    const useCase = createUseCase({
      repository,
      testCaseRepository,
      publishValidator,
      resultMapper,
    });
    const problem = buildProblem();

    problem.publish(TEST_NOW);
    problem.softDelete(TEST_NOW);
    const readiness = { ready: false, issues: [] };
    const detail = { id: problem.id.value };

    const samples = [{ input: '1 2', expectedOutput: '3', displayOrder: 0 }];

    repository.findByIdIncludingDeleted.mockResolvedValue(problem);
    repository.isSlugAvailable.mockResolvedValue(true);
    testCaseRepository.listSamples.mockResolvedValue(samples);
    publishValidator.validate.mockReturnValue(readiness);
    resultMapper.toPreviewDetail.mockResolvedValue(detail);

    await expect(useCase.execute(PRINCIPAL, problem.id.value)).resolves.toBe(detail);

    expect(problem.isDeleted).toBe(true);
    expect(publishValidator.validate).toHaveBeenCalledWith(problem, { slugAvailable: true });
    expect(resultMapper.toPreviewDetail).toHaveBeenCalledWith(problem, readiness, samples);
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

  it('checks ownership before exposing preview data', async () => {
    const authorization = authorizationMock();
    const repository = repositoryMock();
    const useCase = createUseCase({ authorization, repository });
    const problem = buildProblem();

    repository.findByIdIncludingDeleted.mockResolvedValue(problem);
    authorization.requireManaged.mockImplementation(() => {
      throw new Error('forbidden');
    });

    await expect(useCase.execute(PRINCIPAL, problem.id.value)).rejects.toThrow('forbidden');
    expect(repository.isSlugAvailable).not.toHaveBeenCalled();
  });
});

function createUseCase(dependencies: {
  authorization?: ReturnType<typeof authorizationMock>;
  repository?: ReturnType<typeof repositoryMock>;
  testCaseRepository?: ReturnType<typeof testCaseRepositoryMock>;
  publishValidator?: ReturnType<typeof publishValidatorMock>;
  resultMapper?: ReturnType<typeof resultMapperMock>;
}): PreviewProblemUseCase {
  const {
    authorization = authorizationMock(),
    repository = repositoryMock(),
    testCaseRepository = testCaseRepositoryMock(),
    publishValidator = publishValidatorMock(),
    resultMapper = resultMapperMock(),
  } = dependencies;

  return new PreviewProblemUseCase(
    authorization as unknown as ProblemAuthorizationService,
    repository,
    testCaseRepository as unknown as TestCaseRepository,
    publishValidator as unknown as PublishValidator,
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

function testCaseRepositoryMock() {
  return {
    listSamples: jest.fn().mockResolvedValue([]),
  };
}

function publishValidatorMock() {
  return { validate: jest.fn().mockReturnValue({ ready: true, issues: [] }) };
}

function resultMapperMock() {
  return {
    toSummary: jest.fn(),
    toDetail: jest.fn(),
    toManagedSummary: jest.fn(),
    toManagedDetail: jest.fn().mockResolvedValue({ id: 'problem' }),
    toPreviewDetail: jest.fn().mockResolvedValue({ id: 'problem' }),
    toPage: jest.fn(),
    toManagedPage: jest.fn(),
  };
}
