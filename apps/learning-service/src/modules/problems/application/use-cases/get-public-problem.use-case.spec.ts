import { ProblemNotFoundError } from '@learning/modules/problems/application/errors/problem-not-found.error';
import type { ProblemResultMapper } from '@learning/modules/problems/application/results/problem-result.mapper';
import type { TestCaseRepository } from '@learning/modules/problems/domain/repositories/test-case.repository.port.out';
import {
  TEST_PROBLEM_ID,
  buildProblem,
} from '@learning/modules/problems/domain/testing/problem-test.factory';
import { TestSuiteSummary } from '@learning/modules/problems/domain/value-objects';

import { GetPublicProblemUseCase } from './get-public-problem.use-case';

describe('GetPublicProblemUseCase', () => {
  it('returns the mapped detail for a published problem', async () => {
    const repository = repositoryMock();
    const testCaseRepository = testCaseRepositoryMock();
    const resultMapper = resultMapperMock();
    const useCase = createUseCase({ repository, testCaseRepository, resultMapper });
    const problem = buildProblem();
    const detail = { id: problem.id.value };

    const samples = [{ input: '1 2', expectedOutput: '3', displayOrder: 0 }];

    repository.findPublishedByIdOrSlug.mockResolvedValue(problem);
    testCaseRepository.listSamples.mockResolvedValue(samples);
    resultMapper.toDetail.mockResolvedValue(detail);

    await expect(useCase.execute('two-sum')).resolves.toBe(detail);
    expect(repository.findPublishedByIdOrSlug).toHaveBeenCalledWith('two-sum');
    expect(resultMapper.toDetail).toHaveBeenCalledWith(problem, samples);
  });

  it('throws when the problem is not published or does not exist', async () => {
    const repository = repositoryMock();
    const useCase = createUseCase({ repository });

    repository.findPublishedByIdOrSlug.mockResolvedValue(null);

    await expect(useCase.execute(TEST_PROBLEM_ID)).rejects.toBeInstanceOf(ProblemNotFoundError);
  });
});

function createUseCase(dependencies: {
  repository?: ReturnType<typeof repositoryMock>;
  testCaseRepository?: ReturnType<typeof testCaseRepositoryMock>;
  resultMapper?: ReturnType<typeof resultMapperMock>;
}): GetPublicProblemUseCase {
  const {
    repository = repositoryMock(),
    testCaseRepository = testCaseRepositoryMock(),
    resultMapper = resultMapperMock(),
  } = dependencies;

  return new GetPublicProblemUseCase(
    repository,
    testCaseRepository as unknown as TestCaseRepository,
    resultMapper as unknown as ProblemResultMapper,
  );
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

function testCaseRepositoryMock() {
  return {
    listSamples: jest.fn().mockResolvedValue([]),
  };
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
