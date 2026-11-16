import { ProblemNotFoundError } from '@learning/modules/problems/application/errors/problem-not-found.error';
import { PublishNotReadyError } from '@learning/modules/problems/application/errors/publish-not-ready.error';
import type { Principal } from '@learning/modules/problems/application/models/principal';
import type { IRepublishProblemPortIn } from '@learning/modules/problems/application/ports/in/republish-problem.port.in';
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
export class RepublishProblemUseCase implements IRepublishProblemPortIn {
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
    const result = await this.transactionRunner.run(async () => {
      const problem = await this.repository.loadForUpdate(id);

      if (problem === null) {
        throw new ProblemNotFoundError(id);
      }

      this.authorization.requireManaged(principal, 'republish', problem.createdBy.value);
      problem.attachTestSuiteSummary(await this.repository.loadTestSuiteSummary(id));

      const expectedUpdatedAt = problem.updatedAt;
      const slugAvailable = await this.repository.isSlugAvailable(
        problem.slug.value,
        problem.id.value,
      );
      const readiness = this.publishValidator.validate(problem, { slugAvailable });

      if (!readiness.ready) {
        throw new PublishNotReadyError(readiness.issues);
      }

      problem.republish();
      await this.repository.save(problem, expectedUpdatedAt);

      return { problem, readiness };
    });

    const samples = await this.testCaseRepository.listSamples(id);

    return this.resultMapper.toManagedDetail(result.problem, result.readiness, samples);
  }
}
