import { ProblemNotFoundError } from '@learning/modules/problems/application/errors/problem-not-found.error';
import type { Principal } from '@learning/modules/problems/application/models/principal';
import type { IListTestCasesPortIn } from '@learning/modules/problems/application/ports/in/list-test-cases.port.in';
import {
  toTestCaseResult,
  toTestSuiteSummaryResult,
  type TestCaseListResult,
} from '@learning/modules/problems/application/results/test-case.results';
import { ProblemAuthorizationService } from '@learning/modules/problems/application/services/problem-authorization.service';
import type { ProblemRepository } from '@learning/modules/problems/domain/repositories/problem.repository.port.out';
import type { TestCaseRepository } from '@learning/modules/problems/domain/repositories/test-case.repository.port.out';
import {
  PROBLEM_REPOSITORY,
  TEST_CASE_REPOSITORY,
} from '@learning/modules/problems/problem.tokens';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class ListTestCasesUseCase implements IListTestCasesPortIn {
  constructor(
    private readonly authorization: ProblemAuthorizationService,
    @Inject(PROBLEM_REPOSITORY)
    private readonly problemRepository: ProblemRepository,
    @Inject(TEST_CASE_REPOSITORY)
    private readonly testCaseRepository: TestCaseRepository,
  ) {}

  async execute(principal: Principal, problemId: string): Promise<TestCaseListResult> {
    const problem = await this.problemRepository.findById(problemId);

    if (problem === null) {
      throw new ProblemNotFoundError(problemId);
    }

    this.authorization.requireManaged(principal, 'read-managed', problem.createdBy.value);

    const [testCases, summary] = await Promise.all([
      this.testCaseRepository.listByProblem(problemId),
      this.problemRepository.loadTestSuiteSummary(problemId),
    ]);

    return {
      items: testCases.map((testCase) => toTestCaseResult(testCase)),
      testSuiteSummary: toTestSuiteSummaryResult(summary),
    };
  }
}
