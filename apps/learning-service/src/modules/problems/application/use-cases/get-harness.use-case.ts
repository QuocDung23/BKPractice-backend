import type { SupportedLanguage } from '@app/contracts';
import { HarnessNotFoundError } from '@learning/modules/problems/application/errors/harness-not-found.error';
import { ProblemNotFoundError } from '@learning/modules/problems/application/errors/problem-not-found.error';
import type { Principal } from '@learning/modules/problems/application/models/principal';
import type { IGetHarnessPortIn } from '@learning/modules/problems/application/ports/in/get-harness.port.in';
import {
  toHarnessResult,
  type HarnessResult,
} from '@learning/modules/problems/application/results/test-case.results';
import { ProblemAuthorizationService } from '@learning/modules/problems/application/services/problem-authorization.service';
import type { HarnessRepository } from '@learning/modules/problems/domain/repositories/harness.repository.port.out';
import type { ProblemRepository } from '@learning/modules/problems/domain/repositories/problem.repository.port.out';
import { HARNESS_REPOSITORY, PROBLEM_REPOSITORY } from '@learning/modules/problems/problem.tokens';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class GetHarnessUseCase implements IGetHarnessPortIn {
  constructor(
    private readonly authorization: ProblemAuthorizationService,
    @Inject(PROBLEM_REPOSITORY)
    private readonly problemRepository: ProblemRepository,
    @Inject(HARNESS_REPOSITORY)
    private readonly harnessRepository: HarnessRepository,
  ) {}

  async execute(
    principal: Principal,
    problemId: string,
    language: SupportedLanguage,
  ): Promise<HarnessResult> {
    const problem = await this.problemRepository.findById(problemId);

    if (problem === null) {
      throw new ProblemNotFoundError(problemId);
    }

    this.authorization.requireManaged(principal, 'read-managed', problem.createdBy.value);

    const harness = await this.harnessRepository.find(problemId, language);

    if (harness === null) {
      throw new HarnessNotFoundError(problemId, language);
    }

    return toHarnessResult(harness);
  }
}
