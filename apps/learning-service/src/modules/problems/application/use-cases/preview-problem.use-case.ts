import { ProblemNotFoundError } from '@learning/modules/problems/application/errors/problem-not-found.error';
import type { Principal } from '@learning/modules/problems/application/models/principal';
import type { IPreviewProblemPortIn } from '@learning/modules/problems/application/ports/in/preview-problem.port.in';
import { ProblemResultMapper } from '@learning/modules/problems/application/results/problem-result.mapper';
import type { PreviewProblemResult } from '@learning/modules/problems/application/results/problem.results';
import { ProblemAuthorizationService } from '@learning/modules/problems/application/services/problem-authorization.service';
import type { ProblemRepository } from '@learning/modules/problems/domain/repositories/problem.repository.port.out';
import type { TestCaseRepository } from '@learning/modules/problems/domain/repositories/test-case.repository.port.out';
import { PublishValidator } from '@learning/modules/problems/domain/services/publish.validator';
import {
  PROBLEM_REPOSITORY,
  TEST_CASE_REPOSITORY,
} from '@learning/modules/problems/problem.tokens';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class PreviewProblemUseCase implements IPreviewProblemPortIn {
  constructor(
    private readonly authorization: ProblemAuthorizationService,
    @Inject(PROBLEM_REPOSITORY)
    private readonly repository: ProblemRepository,
    @Inject(TEST_CASE_REPOSITORY)
    private readonly testCaseRepository: TestCaseRepository,
    private readonly publishValidator: PublishValidator,
    private readonly resultMapper: ProblemResultMapper,
  ) {}

  async execute(principal: Principal, id: string): Promise<PreviewProblemResult> {
    const problem = await this.repository.findByIdIncludingDeleted(id);

    if (problem === null) {
      throw new ProblemNotFoundError(id);
    }

    this.authorization.requireManaged(principal, 'read-managed', problem.createdBy.value);

    problem.attachTestSuiteSummary(await this.repository.loadTestSuiteSummary(problem.id.value));
    const [slugAvailable, samples] = await Promise.all([
      this.repository.isSlugAvailable(problem.slug.value, problem.id.value),
      this.testCaseRepository.listSamples(problem.id.value),
    ]);
    const readiness = this.publishValidator.validate(problem, { slugAvailable });

    return this.resultMapper.toPreviewDetail(problem, readiness, samples);
  }
}
