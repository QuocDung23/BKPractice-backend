import type { SupportedLanguage } from '@app/contracts';
import { HarnessNotFoundError } from '@learning/modules/problems/application/errors/harness-not-found.error';
import { ProblemNotFoundError } from '@learning/modules/problems/application/errors/problem-not-found.error';
import type { Principal } from '@learning/modules/problems/application/models/principal';
import type { IRemoveHarnessPortIn } from '@learning/modules/problems/application/ports/in/remove-harness.port.in';
import type { TransactionRunner } from '@learning/modules/problems/application/ports/out/transaction-runner.port.out';
import { ProblemAuthorizationService } from '@learning/modules/problems/application/services/problem-authorization.service';
import { TestSuiteReadinessService } from '@learning/modules/problems/application/services/test-suite-readiness.service';
import type { HarnessRepository } from '@learning/modules/problems/domain/repositories/harness.repository.port.out';
import type { ProblemRepository } from '@learning/modules/problems/domain/repositories/problem.repository.port.out';
import {
  HARNESS_REPOSITORY,
  PROBLEM_REPOSITORY,
  TRANSACTION_RUNNER,
} from '@learning/modules/problems/problem.tokens';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class RemoveHarnessUseCase implements IRemoveHarnessPortIn {
  constructor(
    private readonly authorization: ProblemAuthorizationService,
    @Inject(PROBLEM_REPOSITORY)
    private readonly problemRepository: ProblemRepository,
    @Inject(HARNESS_REPOSITORY)
    private readonly harnessRepository: HarnessRepository,
    private readonly readiness: TestSuiteReadinessService,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactionRunner: TransactionRunner,
  ) {}

  async execute(
    principal: Principal,
    problemId: string,
    language: SupportedLanguage,
  ): Promise<void> {
    await this.transactionRunner.run(async () => {
      const problem = await this.problemRepository.loadForUpdate(problemId, true);

      if (problem === null) {
        throw new ProblemNotFoundError(problemId);
      }

      this.authorization.requireManaged(principal, 'update', problem.createdBy.value);
      problem.assertCanManageHarnesses();

      const existing = await this.harnessRepository.find(problemId, language);

      if (existing === null) {
        throw new HarnessNotFoundError(problemId, language);
      }

      if (problem.hasEnabledLanguage(language)) {
        const summary = await this.problemRepository.loadTestSuiteSummary(problemId);

        problem.attachTestSuiteSummary(summary.withHarnessRemoved(language, existing.sourceBytes));
        this.readiness.assertReadyWhenPublished(problem);
      }

      const removed = await this.harnessRepository.remove(problemId, language);

      if (!removed) {
        throw new HarnessNotFoundError(problemId, language);
      }
    });
  }
}
