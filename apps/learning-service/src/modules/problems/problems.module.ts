import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ADD_TEST_CASE_PORT_IN } from './application/ports/in/add-test-case.port.in';
import { BUILD_JUDGE_PACKAGE_PORT_IN } from './application/ports/in/build-judge-package.port.in';
import { CREATE_PROBLEM_PORT_IN } from './application/ports/in/create-problem.port.in';
import { GET_HARNESS_PORT_IN } from './application/ports/in/get-harness.port.in';
import { GET_MANAGED_PROBLEM_PORT_IN } from './application/ports/in/get-managed-problem.port.in';
import { GET_PUBLIC_PROBLEM_PORT_IN } from './application/ports/in/get-public-problem.port.in';
import { GET_TEST_CASE_PORT_IN } from './application/ports/in/get-test-case.port.in';
import { HOLD_PROBLEM_PORT_IN } from './application/ports/in/hold-problem.port.in';
import { LIST_MANAGED_PROBLEMS_PORT_IN } from './application/ports/in/list-managed-problems.port.in';
import { LIST_PUBLIC_PROBLEMS_PORT_IN } from './application/ports/in/list-public-problems.port.in';
import { LIST_TEST_CASES_PORT_IN } from './application/ports/in/list-test-cases.port.in';
import { LIST_TOPICS_PORT_IN } from './application/ports/in/list-topics.port.in';
import { PREVIEW_PROBLEM_PORT_IN } from './application/ports/in/preview-problem.port.in';
import { PUBLISH_PROBLEM_PORT_IN } from './application/ports/in/publish-problem.port.in';
import { REMOVE_HARNESS_PORT_IN } from './application/ports/in/remove-harness.port.in';
import { REMOVE_TEST_CASE_PORT_IN } from './application/ports/in/remove-test-case.port.in';
import { REORDER_TEST_CASES_PORT_IN } from './application/ports/in/reorder-test-cases.port.in';
import { REPUBLISH_PROBLEM_PORT_IN } from './application/ports/in/republish-problem.port.in';
import { RESTORE_PROBLEM_PORT_IN } from './application/ports/in/restore-problem.port.in';
import { SET_HARNESS_PORT_IN } from './application/ports/in/set-harness.port.in';
import { SOFT_DELETE_PROBLEM_PORT_IN } from './application/ports/in/soft-delete-problem.port.in';
import { UPDATE_PROBLEM_PORT_IN } from './application/ports/in/update-problem.port.in';
import { UPDATE_TEST_CASE_PORT_IN } from './application/ports/in/update-test-case.port.in';
import { ProblemResultMapper } from './application/results/problem-result.mapper';
import { ProblemAuthorizationService } from './application/services/problem-authorization.service';
import { TestSuiteReadinessService } from './application/services/test-suite-readiness.service';
import { AddTestCaseUseCase } from './application/use-cases/add-test-case.use-case';
import { BuildJudgePackageUseCase } from './application/use-cases/build-judge-package.use-case';
import { CreateProblemUseCase } from './application/use-cases/create-problem.use-case';
import { GetHarnessUseCase } from './application/use-cases/get-harness.use-case';
import { GetManagedProblemUseCase } from './application/use-cases/get-managed-problem.use-case';
import { GetPublicProblemUseCase } from './application/use-cases/get-public-problem.use-case';
import { GetTestCaseUseCase } from './application/use-cases/get-test-case.use-case';
import { HoldProblemUseCase } from './application/use-cases/hold-problem.use-case';
import { ListManagedProblemsUseCase } from './application/use-cases/list-managed-problems.use-case';
import { ListPublicProblemsUseCase } from './application/use-cases/list-public-problems.use-case';
import { ListTestCasesUseCase } from './application/use-cases/list-test-cases.use-case';
import { ListTopicsUseCase } from './application/use-cases/list-topics.use-case';
import { PreviewProblemUseCase } from './application/use-cases/preview-problem.use-case';
import { PublishProblemUseCase } from './application/use-cases/publish-problem.use-case';
import { RemoveHarnessUseCase } from './application/use-cases/remove-harness.use-case';
import { RemoveTestCaseUseCase } from './application/use-cases/remove-test-case.use-case';
import { ReorderTestCasesUseCase } from './application/use-cases/reorder-test-cases.use-case';
import { RepublishProblemUseCase } from './application/use-cases/republish-problem.use-case';
import { RestoreProblemUseCase } from './application/use-cases/restore-problem.use-case';
import { SetHarnessUseCase } from './application/use-cases/set-harness.use-case';
import { SoftDeleteProblemUseCase } from './application/use-cases/soft-delete-problem.use-case';
import { UpdateProblemUseCase } from './application/use-cases/update-problem.use-case';
import { UpdateTestCaseUseCase } from './application/use-cases/update-test-case.use-case';
import { ContentFormatValidator } from './domain/services/content-format.validator';
import { ProblemContractValidator } from './domain/services/problem-contract.validator';
import { PublishValidator } from './domain/services/publish.validator';
import {
  Problem,
  ProblemHarness,
  ProblemLanguage,
  StarterCode,
  Tag,
  TestCase,
  Topic,
} from './entities/problem.entity';
import { HarnessTypeOrmRepository } from './infrastructure/persistence/harness.typeorm-repository';
import { ProblemReferenceReaderAdapter } from './infrastructure/persistence/problem-reference-reader.adapter';
import { ProblemPersistenceMapper } from './infrastructure/persistence/problem.persistence-mapper';
import { ProblemTypeOrmRepository } from './infrastructure/persistence/problem.typeorm-repository';
import { TestCasePersistenceMapper } from './infrastructure/persistence/test-case.persistence-mapper';
import { TestCaseTypeOrmRepository } from './infrastructure/persistence/test-case.typeorm-repository';
import { TopicTagTypeOrmReader } from './infrastructure/persistence/topic-tag.typeorm-reader';
import { TypeOrmTransactionContext } from './infrastructure/persistence/typeorm-transaction-context';
import { TypeOrmTransactionRunner } from './infrastructure/persistence/typeorm-transaction-runner';
import { InternalServiceGuard } from './internal-service.guard';
import { ProblemExceptionFilter } from './presentation/http/filters/problem-exception.filter';
import { ManagedProblemsController } from './presentation/http/managed-problems.controller';
import { ManagedTestCasesController } from './presentation/http/managed-test-cases.controller';
import { ProblemRequestMapper } from './presentation/http/mappers/problem-request.mapper';
import { ProblemResponseMapper } from './presentation/http/mappers/problem-response.mapper';
import { PublicProblemsController } from './presentation/http/public-problems.controller';
import { PublicTopicsController } from './presentation/http/public-topics.controller';
import {
  HARNESS_REPOSITORY,
  PROBLEM_REPOSITORY,
  TEST_CASE_REPOSITORY,
  TOPIC_TAG_READER,
  TRANSACTION_RUNNER,
  PROBLEM_REFERENCE_READER,
} from './problem.tokens';
import { ProblemsController } from './problems.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Problem,
      ProblemHarness,
      TestCase,
      StarterCode,
      ProblemLanguage,
      Topic,
      Tag,
    ]),
  ],
  controllers: [
    ManagedProblemsController,
    ManagedTestCasesController,
    PublicProblemsController,
    PublicTopicsController,
    ProblemsController,
  ],
  providers: [
    InternalServiceGuard,
    ProblemExceptionFilter,
    { provide: ContentFormatValidator, useFactory: () => new ContentFormatValidator() },
    { provide: ProblemContractValidator, useFactory: () => new ProblemContractValidator() },
    {
      provide: PublishValidator,
      useFactory: (contractValidator: ProblemContractValidator) =>
        new PublishValidator(contractValidator),
      inject: [ProblemContractValidator],
    },
    ProblemAuthorizationService,
    TestSuiteReadinessService,
    ProblemResultMapper,
    AddTestCaseUseCase,
    BuildJudgePackageUseCase,
    CreateProblemUseCase,
    GetHarnessUseCase,
    GetManagedProblemUseCase,
    GetPublicProblemUseCase,
    GetTestCaseUseCase,
    HoldProblemUseCase,
    ListManagedProblemsUseCase,
    ListPublicProblemsUseCase,
    ListTestCasesUseCase,
    ListTopicsUseCase,
    PreviewProblemUseCase,
    PublishProblemUseCase,
    RemoveHarnessUseCase,
    RemoveTestCaseUseCase,
    ReorderTestCasesUseCase,
    RepublishProblemUseCase,
    RestoreProblemUseCase,
    SetHarnessUseCase,
    SoftDeleteProblemUseCase,
    UpdateProblemUseCase,
    UpdateTestCaseUseCase,
    ProblemRequestMapper,
    ProblemResponseMapper,
    ProblemPersistenceMapper,
    TestCasePersistenceMapper,
    TypeOrmTransactionContext,
    TypeOrmTransactionRunner,
    ProblemTypeOrmRepository,
    TestCaseTypeOrmRepository,
    HarnessTypeOrmRepository,
    TopicTagTypeOrmReader,
    { provide: PROBLEM_REPOSITORY, useExisting: ProblemTypeOrmRepository },
    { provide: TEST_CASE_REPOSITORY, useExisting: TestCaseTypeOrmRepository },
    { provide: HARNESS_REPOSITORY, useExisting: HarnessTypeOrmRepository },
    { provide: TOPIC_TAG_READER, useExisting: TopicTagTypeOrmReader },
    { provide: TRANSACTION_RUNNER, useExisting: TypeOrmTransactionRunner },
    { provide: ADD_TEST_CASE_PORT_IN, useExisting: AddTestCaseUseCase },
    { provide: BUILD_JUDGE_PACKAGE_PORT_IN, useExisting: BuildJudgePackageUseCase },
    { provide: CREATE_PROBLEM_PORT_IN, useExisting: CreateProblemUseCase },
    { provide: GET_HARNESS_PORT_IN, useExisting: GetHarnessUseCase },
    { provide: GET_MANAGED_PROBLEM_PORT_IN, useExisting: GetManagedProblemUseCase },
    { provide: GET_PUBLIC_PROBLEM_PORT_IN, useExisting: GetPublicProblemUseCase },
    { provide: GET_TEST_CASE_PORT_IN, useExisting: GetTestCaseUseCase },
    { provide: HOLD_PROBLEM_PORT_IN, useExisting: HoldProblemUseCase },
    { provide: LIST_MANAGED_PROBLEMS_PORT_IN, useExisting: ListManagedProblemsUseCase },
    { provide: LIST_PUBLIC_PROBLEMS_PORT_IN, useExisting: ListPublicProblemsUseCase },
    { provide: LIST_TEST_CASES_PORT_IN, useExisting: ListTestCasesUseCase },
    { provide: LIST_TOPICS_PORT_IN, useExisting: ListTopicsUseCase },
    { provide: PREVIEW_PROBLEM_PORT_IN, useExisting: PreviewProblemUseCase },
    { provide: PUBLISH_PROBLEM_PORT_IN, useExisting: PublishProblemUseCase },
    { provide: REMOVE_HARNESS_PORT_IN, useExisting: RemoveHarnessUseCase },
    { provide: REMOVE_TEST_CASE_PORT_IN, useExisting: RemoveTestCaseUseCase },
    { provide: REORDER_TEST_CASES_PORT_IN, useExisting: ReorderTestCasesUseCase },
    { provide: REPUBLISH_PROBLEM_PORT_IN, useExisting: RepublishProblemUseCase },
    { provide: RESTORE_PROBLEM_PORT_IN, useExisting: RestoreProblemUseCase },
    { provide: SET_HARNESS_PORT_IN, useExisting: SetHarnessUseCase },
    { provide: SOFT_DELETE_PROBLEM_PORT_IN, useExisting: SoftDeleteProblemUseCase },
    { provide: UPDATE_PROBLEM_PORT_IN, useExisting: UpdateProblemUseCase },
    { provide: UPDATE_TEST_CASE_PORT_IN, useExisting: UpdateTestCaseUseCase },
    ProblemReferenceReaderAdapter,
    { provide: PROBLEM_REFERENCE_READER, useExisting: ProblemReferenceReaderAdapter },
  ],
  exports: [PROBLEM_REFERENCE_READER],
})
export class ProblemsModule {}
