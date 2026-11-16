import { SUPPORTED_LANGUAGES } from '@app/contracts';
import type { SetHarnessCommand } from '@learning/modules/problems/application/command/test-case.commands';
import { ProblemNotFoundError } from '@learning/modules/problems/application/errors/problem-not-found.error';
import type { Principal } from '@learning/modules/problems/application/models/principal';
import type { ISetHarnessPortIn } from '@learning/modules/problems/application/ports/in/set-harness.port.in';
import type { TransactionRunner } from '@learning/modules/problems/application/ports/out/transaction-runner.port.out';
import {
  toHarnessResult,
  type HarnessResult,
} from '@learning/modules/problems/application/results/test-case.results';
import { ProblemAuthorizationService } from '@learning/modules/problems/application/services/problem-authorization.service';
import { TestSuiteReadinessService } from '@learning/modules/problems/application/services/test-suite-readiness.service';
import { Harness } from '@learning/modules/problems/domain/harness.aggregate';
import type { HarnessRepository } from '@learning/modules/problems/domain/repositories/harness.repository.port.out';
import type { ProblemRepository } from '@learning/modules/problems/domain/repositories/problem.repository.port.out';
import { assertEnumValue } from '@learning/modules/problems/domain/value-objects/value-object.utils';
import {
  HARNESS_REPOSITORY,
  PROBLEM_REPOSITORY,
  TRANSACTION_RUNNER,
} from '@learning/modules/problems/problem.tokens';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class SetHarnessUseCase implements ISetHarnessPortIn {
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
    command: SetHarnessCommand,
  ): Promise<HarnessResult> {
    return this.transactionRunner.run(async () => {
      const problem = await this.problemRepository.loadForUpdate(problemId, true);

      if (problem === null) {
        throw new ProblemNotFoundError(problemId);
      }

      this.authorization.requireManaged(principal, 'update', problem.createdBy.value);
      problem.assertCanManageHarnesses();

      const language = assertEnumValue(command.language, SUPPORTED_LANGUAGES, 'language');

      const harness = Harness.create({
        problemId: problem.id,
        language,
        source: command.source,
      });

      // A harness may be staged before its language is enabled; only enabled ones count toward the summary.
      if (problem.hasEnabledLanguage(language)) {
        const [summary, existing] = await Promise.all([
          this.problemRepository.loadTestSuiteSummary(problemId),
          this.harnessRepository.find(problemId, language),
        ]);

        problem.attachTestSuiteSummary(
          summary.withHarnessSet(
            language,
            existing === null ? null : existing.sourceBytes,
            harness.sourceBytes,
          ),
        );
        this.readiness.assertReadyWhenPublished(problem);
      }

      await this.harnessRepository.upsert(harness);

      return toHarnessResult(harness);
    });
  }
}
