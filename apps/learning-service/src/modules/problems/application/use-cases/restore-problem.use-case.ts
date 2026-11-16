import { ConcurrentModificationError } from '@learning/modules/problems/application/errors/concurrent-modification.error';
import { ProblemNotFoundError } from '@learning/modules/problems/application/errors/problem-not-found.error';
import type { Principal } from '@learning/modules/problems/application/models/principal';
import type { IRestoreProblemPortIn } from '@learning/modules/problems/application/ports/in/restore-problem.port.in';
import type { TransactionRunner } from '@learning/modules/problems/application/ports/out/transaction-runner.port.out';
import { ProblemResultMapper } from '@learning/modules/problems/application/results/problem-result.mapper';
import type { ManagedProblemDetailResult } from '@learning/modules/problems/application/results/problem.results';
import { ProblemAuthorizationService } from '@learning/modules/problems/application/services/problem-authorization.service';
import type { ProblemRepository } from '@learning/modules/problems/domain/repositories/problem.repository.port.out';
import type { TestCaseRepository } from '@learning/modules/problems/domain/repositories/test-case.repository.port.out';
import { PublishValidator } from '@learning/modules/problems/domain/services/publish.validator';
import {
  PROBLEM_REPOSITORY,
  TEST_CASE_REPOSITORY,
  TRANSACTION_RUNNER,
} from '@learning/modules/problems/problem.tokens';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class RestoreProblemUseCase implements IRestoreProblemPortIn {
  constructor(
    private readonly authorization: ProblemAuthorizationService,
    @Inject(PROBLEM_REPOSITORY)
    private readonly repository: ProblemRepository,
    @Inject(TEST_CASE_REPOSITORY)
    private readonly testCaseRepository: TestCaseRepository,
    private readonly publishValidator: PublishValidator,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactionRunner: TransactionRunner,
    private readonly resultMapper: ProblemResultMapper,
  ) {}

  async execute(principal: Principal, id: string): Promise<ManagedProblemDetailResult> {
    const problem = await this.repository.findByIdIncludingDeleted(id);

    if (problem === null) {
      throw new ProblemNotFoundError(id);
    }

    this.authorization.requireManaged(principal, 'restore', problem.createdBy.value);
    const now = new Date();
    problem.restore(now);

    const restored = await this.transactionRunner.run(() => this.repository.restore(id, now));

    if (!restored) {
      const current = await this.repository.findByIdIncludingDeleted(id);

      if (current === null) {
        throw new ProblemNotFoundError(id);
      }

      throw new ConcurrentModificationError();
    }

    problem.attachTestSuiteSummary(await this.repository.loadTestSuiteSummary(problem.id.value));
    const slugAvailable = await this.repository.isSlugAvailable(
      problem.slug.value,
      problem.id.value,
    );
    const readiness = this.publishValidator.validate(problem, { slugAvailable });

    const samples = await this.testCaseRepository.listSamples(problem.id.value);

    return this.resultMapper.toManagedDetail(problem, readiness, samples);
  }
}
