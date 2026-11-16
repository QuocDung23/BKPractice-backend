import { ProblemNotFoundError } from '@learning/modules/problems/application/errors/problem-not-found.error';
import type { Principal } from '@learning/modules/problems/application/models/principal';
import type { IHoldProblemPortIn } from '@learning/modules/problems/application/ports/in/hold-problem.port.in';
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
export class HoldProblemUseCase implements IHoldProblemPortIn {
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
    const problem = await this.repository.findById(id);

    if (problem === null) {
      throw new ProblemNotFoundError(id);
    }

    this.authorization.requireManaged(principal, 'hold', problem.createdBy.value);

    const expectedUpdatedAt = problem.updatedAt;
    const [summary, samples] = await Promise.all([
      this.repository.loadTestSuiteSummary(problem.id.value),
      this.testCaseRepository.listSamples(problem.id.value),
    ]);
    problem.attachTestSuiteSummary(summary);
    problem.hold();

    await this.transactionRunner.run(() => this.repository.save(problem, expectedUpdatedAt));

    const readiness = this.publishValidator.validate(problem, {
      slugAvailable: true,
    });

    return this.resultMapper.toManagedDetail(problem, readiness, samples);
  }
}
