import type { Principal } from '@learning/modules/problems/application/models/principal';
import type { IListManagedProblemsPortIn } from '@learning/modules/problems/application/ports/in/list-managed-problems.port.in';
import { ProblemResultMapper } from '@learning/modules/problems/application/results/problem-result.mapper';
import type { ManagedProblemSummaryResult } from '@learning/modules/problems/application/results/problem.results';
import { ProblemAuthorizationService } from '@learning/modules/problems/application/services/problem-authorization.service';
import type {
  ProblemPage,
  ProblemRepository,
} from '@learning/modules/problems/domain/repositories/problem.repository.port.out';
import {
  PublishValidator,
  type PublishReadiness,
} from '@learning/modules/problems/domain/services/publish.validator';
import { TestSuiteSummary } from '@learning/modules/problems/domain/value-objects';
import { PROBLEM_REPOSITORY } from '@learning/modules/problems/problem.tokens';
import { Inject, Injectable } from '@nestjs/common';

const MAX_LIMIT = 100;

@Injectable()
export class ListManagedProblemsUseCase implements IListManagedProblemsPortIn {
  constructor(
    private readonly authorization: ProblemAuthorizationService,
    @Inject(PROBLEM_REPOSITORY)
    private readonly repository: ProblemRepository,
    private readonly publishValidator: PublishValidator,
    private readonly resultMapper: ProblemResultMapper,
  ) {}

  async execute(
    principal: Principal,
    includeDeleted: boolean,
    page: number,
    limit: number,
  ): Promise<ProblemPage<ManagedProblemSummaryResult>> {
    this.authorization.requireManagedList(principal);
    const normalizedPage = normalizePage(page);
    const normalizedLimit = normalizeLimit(limit);
    const result = await this.repository.listManaged({
      createdBy: principal.roles.includes('ADMIN') ? undefined : principal.userId,
      includeDeleted,
      page: normalizedPage,
      limit: normalizedLimit,
    });
    const summaries = await this.repository.loadTestSuiteSummaries(
      result.items.map((problem) => problem.id.value),
    );
    const readinessByProblemId = new Map<string, PublishReadiness>();

    for (const problem of result.items) {
      problem.attachTestSuiteSummary(summaries.get(problem.id.value) ?? TestSuiteSummary.empty());
      readinessByProblemId.set(
        problem.id.value,
        this.publishValidator.validate(problem, { slugAvailable: true }),
      );
    }

    return this.resultMapper.toManagedPage(
      result.items,
      result.total,
      result.page,
      result.limit,
      readinessByProblemId,
    );
  }
}

function normalizePage(value: number): number {
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1;
}

function normalizeLimit(value: number): number {
  return Number.isFinite(value) && value >= 1 ? Math.min(MAX_LIMIT, Math.floor(value)) : 20;
}
