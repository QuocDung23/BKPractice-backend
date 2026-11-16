import { ProblemNotFoundError } from '@learning/modules/problems/application/errors/problem-not-found.error';
import { TestCaseNotFoundError } from '@learning/modules/problems/application/errors/test-case-not-found.error';
import type { Principal } from '@learning/modules/problems/application/models/principal';
import type { IGetTestCasePortIn } from '@learning/modules/problems/application/ports/in/get-test-case.port.in';
import {
  toTestCaseResult,
  type TestCaseResult,
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
export class GetTestCaseUseCase implements IGetTestCasePortIn {
  constructor(
    private readonly authorization: ProblemAuthorizationService,
    @Inject(PROBLEM_REPOSITORY)
    private readonly problemRepository: ProblemRepository,
    @Inject(TEST_CASE_REPOSITORY)
    private readonly testCaseRepository: TestCaseRepository,
  ) {}

  async execute(
    principal: Principal,
    problemId: string,
    testCaseId: string,
  ): Promise<TestCaseResult> {
    const problem = await this.problemRepository.findById(problemId);

    if (problem === null) {
      throw new ProblemNotFoundError(problemId);
    }

    this.authorization.requireManaged(principal, 'read-managed', problem.createdBy.value);

    const testCase = await this.testCaseRepository.findById(problemId, testCaseId);

    if (testCase === null) {
      throw new TestCaseNotFoundError(testCaseId);
    }

    return toTestCaseResult(testCase);
  }
}
