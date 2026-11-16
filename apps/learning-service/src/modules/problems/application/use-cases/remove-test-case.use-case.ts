import { ProblemNotFoundError } from '@learning/modules/problems/application/errors/problem-not-found.error';
import { TestCaseNotFoundError } from '@learning/modules/problems/application/errors/test-case-not-found.error';
import type { Principal } from '@learning/modules/problems/application/models/principal';
import type { IRemoveTestCasePortIn } from '@learning/modules/problems/application/ports/in/remove-test-case.port.in';
import type { TransactionRunner } from '@learning/modules/problems/application/ports/out/transaction-runner.port.out';
import { ProblemAuthorizationService } from '@learning/modules/problems/application/services/problem-authorization.service';
import { TestSuiteReadinessService } from '@learning/modules/problems/application/services/test-suite-readiness.service';
import type { ProblemRepository } from '@learning/modules/problems/domain/repositories/problem.repository.port.out';
import type { TestCaseRepository } from '@learning/modules/problems/domain/repositories/test-case.repository.port.out';
import {
  PROBLEM_REPOSITORY,
  TEST_CASE_REPOSITORY,
  TRANSACTION_RUNNER,
} from '@learning/modules/problems/problem.tokens';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class RemoveTestCaseUseCase implements IRemoveTestCasePortIn {
  constructor(
    private readonly authorization: ProblemAuthorizationService,
    @Inject(PROBLEM_REPOSITORY)
    private readonly problemRepository: ProblemRepository,
    @Inject(TEST_CASE_REPOSITORY)
    private readonly testCaseRepository: TestCaseRepository,
    private readonly readiness: TestSuiteReadinessService,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactionRunner: TransactionRunner,
  ) {}

  async execute(principal: Principal, problemId: string, testCaseId: string): Promise<void> {
    await this.transactionRunner.run(async () => {
      const problem = await this.problemRepository.loadForUpdate(problemId, true);

      if (problem === null) {
        throw new ProblemNotFoundError(problemId);
      }

      this.authorization.requireManaged(principal, 'update', problem.createdBy.value);
      problem.assertCanManageTestCases();

      const existing = await this.testCaseRepository.findById(problemId, testCaseId);

      if (existing === null) {
        throw new TestCaseNotFoundError(testCaseId);
      }

      const summary = await this.problemRepository.loadTestSuiteSummary(problemId);

      problem.attachTestSuiteSummary(
        summary.withTestCaseRemoved({
          visibility: existing.visibility,
          score: existing.score,
          bytes: existing.payloadBytes,
        }),
      );
      this.readiness.assertReadyWhenPublished(problem);

      const removed = await this.testCaseRepository.remove(problemId, testCaseId);

      if (!removed) {
        throw new TestCaseNotFoundError(testCaseId);
      }
    });
  }
}
