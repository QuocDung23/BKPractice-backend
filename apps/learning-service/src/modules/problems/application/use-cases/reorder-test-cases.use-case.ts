import type { ReorderTestCasesCommand } from '@learning/modules/problems/application/command/test-case.commands';
import { ProblemNotFoundError } from '@learning/modules/problems/application/errors/problem-not-found.error';
import type { Principal } from '@learning/modules/problems/application/models/principal';
import type { IReorderTestCasesPortIn } from '@learning/modules/problems/application/ports/in/reorder-test-cases.port.in';
import type { TransactionRunner } from '@learning/modules/problems/application/ports/out/transaction-runner.port.out';
import {
  toTestCaseResult,
  type TestCaseResult,
} from '@learning/modules/problems/application/results/test-case.results';
import { ProblemAuthorizationService } from '@learning/modules/problems/application/services/problem-authorization.service';
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
export class ReorderTestCasesUseCase implements IReorderTestCasesPortIn {
  constructor(
    private readonly authorization: ProblemAuthorizationService,
    @Inject(PROBLEM_REPOSITORY)
    private readonly problemRepository: ProblemRepository,
    @Inject(TEST_CASE_REPOSITORY)
    private readonly testCaseRepository: TestCaseRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactionRunner: TransactionRunner,
  ) {}

  async execute(
    principal: Principal,
    problemId: string,
    command: ReorderTestCasesCommand,
  ): Promise<readonly TestCaseResult[]> {
    return this.transactionRunner.run(async () => {
      const problem = await this.problemRepository.loadForUpdate(problemId, true);

      if (problem === null) {
        throw new ProblemNotFoundError(problemId);
      }

      this.authorization.requireManaged(principal, 'update', problem.createdBy.value);
      problem.assertCanManageTestCases();

      const current = await this.testCaseRepository.listByProblem(problemId);
      const currentIds = new Set(current.map((testCase) => testCase.id.value));
      const orderedIds = command.testCaseIds.map((testCaseId) => testCaseId.value);

      if (
        orderedIds.length !== currentIds.size ||
        new Set(orderedIds).size !== orderedIds.length ||
        orderedIds.some((testCaseId) => !currentIds.has(testCaseId))
      ) {
        throw new DomainValidationError(
          'testCaseIds',
          'testCaseIds must contain every test case exactly once',
        );
      }

      await this.testCaseRepository.reorder(problemId, orderedIds);

      const reordered = await this.testCaseRepository.listByProblem(problemId);

      return reordered.map((testCase) => toTestCaseResult(testCase));
    });
  }
}
