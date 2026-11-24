import { ConcurrentModificationError } from '@learning/modules/problems/application/errors/concurrent-modification.error';
import { DuplicateProblemIdError } from '@learning/modules/problems/domain/errors/duplicate-problem-id.error';
import { DuplicateSlugError } from '@learning/modules/problems/domain/errors/duplicate-slug.error';
import { buildProblem } from '@learning/modules/problems/domain/testing/problem-test.factory';
import { PublishStatus as EntityPublishStatus } from '@learning/modules/problems/entities/problem.entity';
import type { DataSource } from 'typeorm';
import { QueryFailedError } from 'typeorm';

import { ProblemPersistenceMapper } from './problem.persistence-mapper';
import { ProblemTypeOrmRepository } from './problem.typeorm-repository';
import { TypeOrmTransactionContext } from './typeorm-transaction-context';

const PROBLEM_ID = '00000000-0000-4000-8000-000000000021';

describe('ProblemTypeOrmRepository unit', () => {
  const mapper = new ProblemPersistenceMapper();

  it('maps a slug unique violation to DuplicateSlugError', async () => {
    const problem = buildProblem();
    const driverError = Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint: 'UQ_problems_slug',
      detail: 'Key (slug)=(two-sum) already exists.',
    });
    const manager = {
      insert: jest.fn().mockRejectedValue(new QueryFailedError('INSERT', [], driverError)),
      query: jest.fn(),
    };
    const repository = new ProblemTypeOrmRepository(contextWith(manager), mapper);

    await expect(repository.save(problem)).rejects.toBeInstanceOf(DuplicateSlugError);
  });

  it('maps a duplicate generated problem ID without writing relations', async () => {
    const driverError = Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint: 'problems_pkey',
      detail: `Key (id)=(${PROBLEM_ID}) already exists.`,
    });
    const manager = {
      insert: jest.fn().mockRejectedValue(new QueryFailedError('INSERT', [], driverError)),
      query: jest.fn(),
    };
    const repository = new ProblemTypeOrmRepository(contextWith(manager), mapper);

    await expect(repository.save(buildProblem())).rejects.toBeInstanceOf(DuplicateProblemIdError);
    expect(manager.query).not.toHaveBeenCalled();
  });

  it('rethrows unrelated unique violations', async () => {
    const problem = buildProblem();
    const driverError = Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint: 'uq_starter_codes_problem_language',
      detail: 'Key (problem_id, language) already exists.',
    });
    const original = new QueryFailedError('INSERT', [], driverError);
    const manager = {
      insert: jest.fn().mockRejectedValue(original),
      query: jest.fn(),
    };
    const repository = new ProblemTypeOrmRepository(contextWith(manager), mapper);

    await expect(repository.save(problem)).rejects.toBe(original);
  });

  it('maps affected = 0 to ConcurrentModificationError without writing relations', async () => {
    const problem = buildProblem();
    const execute = jest.fn().mockResolvedValue({ affected: 0 });
    const updateBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      setParameters: jest.fn().mockReturnThis(),
      execute,
    };
    const query = jest.fn();
    const manager = {
      createQueryBuilder: jest.fn().mockReturnValue(updateBuilder),
      query,
    };
    const repository = new ProblemTypeOrmRepository(contextWith(manager), mapper);

    await expect(
      repository.save(problem, new Date('2026-01-01T00:00:00.000Z')),
    ).rejects.toBeInstanceOf(ConcurrentModificationError);
    expect(query).not.toHaveBeenCalled();
  });

  it('requires an active transaction for writes', async () => {
    const repository = new ProblemTypeOrmRepository(
      new TypeOrmTransactionContext({} as DataSource),
      mapper,
    );

    await expect(repository.save(buildProblem())).rejects.toThrow(
      'Problem write requires an active transaction',
    );
  });

  it('aggregates test case and harness bytes in loadTestSuiteSummary', async () => {
    const manager = {
      query: jest
        .fn()
        .mockResolvedValueOnce([
          {
            problemId: PROBLEM_ID,
            totalCount: 2,
            hiddenCount: 1,
            totalScore: '15',
            testCaseBytes: '10',
          },
        ])
        .mockResolvedValueOnce([
          { problemId: PROBLEM_ID, languages: ['python'], harnessBytes: '5' },
        ]),
    };
    const repository = new ProblemTypeOrmRepository(contextWith(manager), mapper);

    const summary = await repository.loadTestSuiteSummary(PROBLEM_ID);

    expect(summary).toMatchObject({
      totalCount: 2,
      hiddenCount: 1,
      totalScore: 15,
      totalBytes: 15,
      harnessLanguages: ['python'],
    });
    expect(manager.query).toHaveBeenCalledTimes(2);
  });

  it('filters deleted rows in findById and published lookups', async () => {
    const { manager, builder } = lookupManager(null);
    const repository = new ProblemTypeOrmRepository(contextWith(manager), mapper);

    expect(await repository.findById(PROBLEM_ID)).toBeNull();
    expect(builder.where).toHaveBeenCalledWith('p.id = :id', { id: PROBLEM_ID });
    expect(builder.andWhere).toHaveBeenCalledWith('p.deletedAt IS NULL');
  });

  it('does not filter deleted rows in findByIdIncludingDeleted', async () => {
    const { manager, builder } = lookupManager(null);
    const repository = new ProblemTypeOrmRepository(contextWith(manager), mapper);

    await repository.findByIdIncludingDeleted(PROBLEM_ID);

    expect(builder.where).toHaveBeenCalledWith('p.id = :id', { id: PROBLEM_ID });
    expect(builder.andWhere).not.toHaveBeenCalledWith('p.deletedAt IS NULL');
  });

  it('looks published records up by UUID and slug with the published filter', async () => {
    const { manager, builder } = lookupManager(null);
    const repository = new ProblemTypeOrmRepository(contextWith(manager), mapper);

    await repository.findPublishedByIdOrSlug(PROBLEM_ID);

    expect(builder.where).toHaveBeenCalledWith('p.publishStatus = :status', {
      status: EntityPublishStatus.Published,
    });
    expect(builder.andWhere).toHaveBeenCalledWith('p.deletedAt IS NULL');
    expect(builder.andWhere).toHaveBeenCalledWith('p.id = :id', { id: PROBLEM_ID });

    const slugLookup = lookupManager(null);
    const slugRepository = new ProblemTypeOrmRepository(contextWith(slugLookup.manager), mapper);

    await slugRepository.findPublishedByIdOrSlug('two-sum');

    expect(slugLookup.builder.andWhere).toHaveBeenCalledWith('p.slug = :slug', {
      slug: 'two-sum',
    });
  });
});

interface LookupBuilder {
  leftJoinAndSelect: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  getOne: jest.Mock;
}

function lookupManager(entity: unknown): { manager: unknown; builder: LookupBuilder } {
  const builder: LookupBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(entity),
  };
  const manager = {
    getRepository: jest.fn().mockReturnValue({
      createQueryBuilder: jest.fn().mockReturnValue(builder),
    }),
  };

  return { manager, builder };
}

function contextWith(manager: unknown): TypeOrmTransactionContext {
  return {
    getManager: () => manager,
    requireManager: () => manager,
  } as unknown as TypeOrmTransactionContext;
}
