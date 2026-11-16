import type { UpdateTestCaseCommand } from '@learning/modules/problems/application/command/test-case.commands';
import { ProblemNotFoundError } from '@learning/modules/problems/application/errors/problem-not-found.error';
import { TestCaseNotFoundError } from '@learning/modules/problems/application/errors/test-case-not-found.error';
import type { Principal } from '@learning/modules/problems/application/models/principal';
import type { IUpdateTestCasePortIn } from '@learning/modules/problems/application/ports/in/update-test-case.port.in';
import type { TransactionRunner } from '@learning/modules/problems/application/ports/out/transaction-runner.port.out';
import {
  toTestCaseResult,
  type TestCaseResult,
} from '@learning/modules/problems/application/results/test-case.results';
import { ProblemAuthorizationService } from '@learning/modules/problems/application/services/problem-authorization.service';
import { TestSuiteReadinessService } from '@learning/modules/problems/application/services/test-suite-readiness.service';
import { DomainValidationError } from '@learning/modules/problems/domain/errors/domain-validation.error';
import type { ProblemRepository } from '@learning/modules/problems/domain/repositories/problem.repository.port.out';
import type { TestCaseRepository } from '@learning/modules/problems/domain/repositories/test-case.repository.port.out';
import {
  PROBLEM_REPOSITORY,
  TEST_CASE_REPOSITORY,
  TRANSACTION_RUNNER,
} from '@learning/modules/problems/problem.tokens';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class UpdateTestCaseUseCase implements IUpdateTestCasePortIn {
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

  async execute(
    principal: Principal,
    problemId: string,
    testCaseId: string,
    command: UpdateTestCaseCommand,
  ): Promise<TestCaseResult> {
    return this.transactionRunner.run(async () => {
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

      const requestedDisplayOrder = command.displayOrder;
      if (requestedDisplayOrder !== undefined) {
        const current = await this.testCaseRepository.listByProblem(problemId);

        if (
          current.some(
            (item) =>
              item.id.value !== testCaseId &&
              item.displayOrder.value === requestedDisplayOrder.value,
          )
        ) {
          throw new DomainValidationError(
            'displayOrder',
            'Display order is already used by another test case',
          );
        }
      }

      const before = {
        visibility: existing.visibility,
        score: existing.score,
        bytes: existing.payloadBytes,
      };
      const after = {
        input: command.input ?? existing.input,
        expectedOutput: command.expectedOutput ?? existing.expectedOutput,
        visibility: command.visibility ?? existing.visibility,
        score: command.score ?? existing.score,
      };

      const summary = await this.problemRepository.loadTestSuiteSummary(problemId);
      problem.attachTestSuiteSummary(
        summary.withTestCaseUpdated(before, {
          input: after.input,
          expectedOutput: after.expectedOutput,
          visibility: after.visibility,
          score: after.score,
        }),
      );
      this.readiness.assertReadyWhenPublished(problem);

      existing.update(command);
      await this.testCaseRepository.update(existing);

      return toTestCaseResult(existing);
    });
  }
}
