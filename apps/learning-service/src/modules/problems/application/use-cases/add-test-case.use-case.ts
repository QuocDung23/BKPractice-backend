import type { AddTestCaseCommand } from '@learning/modules/problems/application/command/test-case.commands';
import { ProblemNotFoundError } from '@learning/modules/problems/application/errors/problem-not-found.error';
import type { Principal } from '@learning/modules/problems/application/models/principal';
import type { IAddTestCasePortIn } from '@learning/modules/problems/application/ports/in/add-test-case.port.in';
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
import { TestCase } from '@learning/modules/problems/domain/test-case.aggregate';
import { DisplayOrder } from '@learning/modules/problems/domain/value-objects';
import {
  PROBLEM_REPOSITORY,
  TEST_CASE_REPOSITORY,
  TRANSACTION_RUNNER,
} from '@learning/modules/problems/problem.tokens';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class AddTestCaseUseCase implements IAddTestCasePortIn {
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
    command: AddTestCaseCommand,
  ): Promise<TestCaseResult> {
    return this.transactionRunner.run(async () => {
      const problem = await this.problemRepository.loadForUpdate(problemId, true);

      if (problem === null) {
        throw new ProblemNotFoundError(problemId);
      }

      this.authorization.requireManaged(principal, 'update', problem.createdBy.value);
      problem.assertCanManageTestCases();

      const [summary, current] = await Promise.all([
        this.problemRepository.loadTestSuiteSummary(problemId),
        this.testCaseRepository.listByProblem(problemId),
      ]);

      const requestedDisplayOrder = command.displayOrder;
      if (
        requestedDisplayOrder !== undefined &&
        current.some((item) => item.displayOrder.value === requestedDisplayOrder.value)
      ) {
        throw new DomainValidationError(
          'displayOrder',
          'Display order is already used by another test case',
        );
      }

      const nextOrder =
        command.displayOrder ??
        new DisplayOrder(
          current.reduce((max, item) => Math.max(max, item.displayOrder.value), -1) + 1,
        );
      const testCase = TestCase.create({
        problemId: problem.id,
        input: command.input,
        expectedOutput: command.expectedOutput,
        visibility: command.visibility,
        score: command.score,
        displayOrder: nextOrder,
      });

      problem.attachTestSuiteSummary(
        summary.withTestCaseAdded({
          input: testCase.input,
          expectedOutput: testCase.expectedOutput,
          visibility: testCase.visibility,
          score: testCase.score,
        }),
      );
      this.readiness.assertReadyWhenPublished(problem);

      await this.testCaseRepository.add(testCase);

      return toTestCaseResult(testCase);
    });
  }
}
