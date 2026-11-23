import type { ProblemResultMapper } from '@learning/modules/problems/application/results/problem-result.mapper';
import { buildProblem } from '@learning/modules/problems/domain/testing/problem-test.factory';
import { TestSuiteSummary } from '@learning/modules/problems/domain/value-objects';

import { ListPublicProblemsUseCase } from './list-public-problems.use-case';

describe('ListPublicProblemsUseCase', () => {
  it('lists published problems with normalized pagination and filters', async () => {
    const repository = repositoryMock();
    const resultMapper = resultMapperMock();
    const useCase = createUseCase({ repository, resultMapper });
    const problem = buildProblem();
    const page = { items: [problem], total: 1, page: 2, limit: 25 };

    repository.listPublished.mockResolvedValue({
      items: [problem],
      total: 1,
      page: 2,
      limit: 25,
    });
    resultMapper.toPage.mockResolvedValue(page);

    await expect(
      useCase.execute(
        {
          search: 'two',
          problemType: 'STANDARD',
          difficulty: 'EASY',
          topicId: 'topic-1',
          tagId: 'tag-1',
          page: 99,
          limit: 999,
        },
        0,
        Number.NaN,
      ),
    ).resolves.toBe(page);

    expect(repository.listPublished).toHaveBeenCalledWith({
      search: 'two',
      problemType: 'STANDARD',
      difficulty: 'EASY',
      topicId: 'topic-1',
      tagId: 'tag-1',
      page: 1,
      limit: 20,
    });
    expect(resultMapper.toPage).toHaveBeenCalledWith([problem], 1, 2, 25);
  });

  it('caps the limit at 100 and floors fractional values', async () => {
    const repository = repositoryMock();
    const useCase = createUseCase({ repository });

    await useCase.execute({ page: 1, limit: 20 }, 2.9, 100.9);

    expect(repository.listPublished).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, limit: 100 }),
    );
  });

  it('falls back to page 1 and limit 20 for invalid values', async () => {
    const repository = repositoryMock();
    const useCase = createUseCase({ repository });

    await useCase.execute({ page: 1, limit: 20 }, -1, Number.POSITIVE_INFINITY);

    expect(repository.listPublished).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 20 }),
    );
  });
});

function createUseCase(dependencies: {
  repository?: ReturnType<typeof repositoryMock>;
  resultMapper?: ReturnType<typeof resultMapperMock>;
}): ListPublicProblemsUseCase {
  const { repository = repositoryMock(), resultMapper = resultMapperMock() } = dependencies;

  return new ListPublicProblemsUseCase(repository, resultMapper as unknown as ProblemResultMapper);
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
    listPublished: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 }),
    listManaged: jest.fn(),
    isSlugAvailable: jest.fn(),
    save: jest.fn(),
    softDelete: jest.fn(),
    isUsedByPublishedCourse: jest.fn(),
    restore: jest.fn(),
  };
}

function resultMapperMock() {
  return {
    toSummary: jest.fn(),
    toDetail: jest.fn(),
    toManagedSummary: jest.fn(),
    toManagedDetail: jest.fn(),
    toPage: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 }),
    toManagedPage: jest.fn(),
  };
}
