import type { Provider } from '@nestjs/common';
import { Test } from '@nestjs/testing';

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
import { ManagedProblemsController } from './presentation/http/managed-problems.controller';
import { ManagedTestCasesController } from './presentation/http/managed-test-cases.controller';
import { PublicProblemsController } from './presentation/http/public-problems.controller';
import { PublicTopicsController } from './presentation/http/public-topics.controller';
import {
  HARNESS_REPOSITORY,
  PROBLEM_REFERENCE_READER,
  PROBLEM_REPOSITORY,
  TEST_CASE_REPOSITORY,
  TOPIC_TAG_READER,
  TRANSACTION_RUNNER,
} from './problem.tokens';
import { ProblemsController } from './problems.controller';
import { ProblemsModule } from './problems.module';

interface ModuleProvider {
  readonly provide: unknown;
  readonly useExisting?: unknown;
}

interface SelfParam {
  readonly index: number;
  readonly param: unknown;
}

const INBOUND_BINDINGS = [
  [CREATE_PROBLEM_PORT_IN, CreateProblemUseCase],
  [UPDATE_PROBLEM_PORT_IN, UpdateProblemUseCase],
  [PUBLISH_PROBLEM_PORT_IN, PublishProblemUseCase],
  [HOLD_PROBLEM_PORT_IN, HoldProblemUseCase],
  [REPUBLISH_PROBLEM_PORT_IN, RepublishProblemUseCase],
  [SOFT_DELETE_PROBLEM_PORT_IN, SoftDeleteProblemUseCase],
  [RESTORE_PROBLEM_PORT_IN, RestoreProblemUseCase],
  [GET_PUBLIC_PROBLEM_PORT_IN, GetPublicProblemUseCase],
  [LIST_PUBLIC_PROBLEMS_PORT_IN, ListPublicProblemsUseCase],
  [GET_MANAGED_PROBLEM_PORT_IN, GetManagedProblemUseCase],
  [LIST_MANAGED_PROBLEMS_PORT_IN, ListManagedProblemsUseCase],
  [PREVIEW_PROBLEM_PORT_IN, PreviewProblemUseCase],
  [ADD_TEST_CASE_PORT_IN, AddTestCaseUseCase],
  [UPDATE_TEST_CASE_PORT_IN, UpdateTestCaseUseCase],
  [REMOVE_TEST_CASE_PORT_IN, RemoveTestCaseUseCase],
  [REORDER_TEST_CASES_PORT_IN, ReorderTestCasesUseCase],
  [LIST_TEST_CASES_PORT_IN, ListTestCasesUseCase],
  [LIST_TOPICS_PORT_IN, ListTopicsUseCase],
  [GET_TEST_CASE_PORT_IN, GetTestCaseUseCase],
  [SET_HARNESS_PORT_IN, SetHarnessUseCase],
  [REMOVE_HARNESS_PORT_IN, RemoveHarnessUseCase],
  [GET_HARNESS_PORT_IN, GetHarnessUseCase],
  [BUILD_JUDGE_PACKAGE_PORT_IN, BuildJudgePackageUseCase],
] as const;

function injectedTokens(controller: object): unknown[] {
  const params = (Reflect.getMetadata('self:paramtypes', controller) ?? []) as SelfParam[];
  return [...params].sort((left, right) => left.index - right.index).map(({ param }) => param);
}

describe('ProblemsModule inbound port wiring', () => {
  it.each(INBOUND_BINDINGS)('binds %p to %p', (token, useCase) => {
    const providers = (Reflect.getMetadata('providers', ProblemsModule) ?? []) as ModuleProvider[];

    expect(providers).toContainEqual({ provide: token, useExisting: useCase });
  });

  it('wires managed controller to inbound port tokens', () => {
    expect(injectedTokens(ManagedProblemsController)).toEqual([
      CREATE_PROBLEM_PORT_IN,
      UPDATE_PROBLEM_PORT_IN,
      PUBLISH_PROBLEM_PORT_IN,
      HOLD_PROBLEM_PORT_IN,
      REPUBLISH_PROBLEM_PORT_IN,
      SOFT_DELETE_PROBLEM_PORT_IN,
      RESTORE_PROBLEM_PORT_IN,
      GET_MANAGED_PROBLEM_PORT_IN,
      LIST_MANAGED_PROBLEMS_PORT_IN,
      PREVIEW_PROBLEM_PORT_IN,
    ]);
  });

  it('wires public controller to inbound port tokens', () => {
    expect(injectedTokens(PublicProblemsController)).toEqual([
      GET_PUBLIC_PROBLEM_PORT_IN,
      LIST_PUBLIC_PROBLEMS_PORT_IN,
    ]);
  });

  it('wires the public topic controller to its inbound port token', () => {
    expect(injectedTokens(PublicTopicsController)).toEqual([LIST_TOPICS_PORT_IN]);
  });

  it('wires managed test case controller to inbound port tokens', () => {
    expect(injectedTokens(ManagedTestCasesController)).toEqual([
      ADD_TEST_CASE_PORT_IN,
      UPDATE_TEST_CASE_PORT_IN,
      REMOVE_TEST_CASE_PORT_IN,
      REORDER_TEST_CASES_PORT_IN,
      LIST_TEST_CASES_PORT_IN,
      GET_TEST_CASE_PORT_IN,
      SET_HARNESS_PORT_IN,
      REMOVE_HARNESS_PORT_IN,
      GET_HARNESS_PORT_IN,
    ]);
  });

  it('wires the internal judge package controller to its inbound port token', () => {
    expect(injectedTokens(ProblemsController)).toEqual([BUILD_JUDGE_PACKAGE_PORT_IN]);
  });
});

describe('ProblemsModule dependency resolution', () => {
  it('resolves every inbound port without request-scoped providers', async () => {
    const adapters: unknown[] = [
      InternalServiceGuard,
      ProblemTypeOrmRepository,
      TopicTagTypeOrmReader,
      TypeOrmTransactionRunner,
      TypeOrmTransactionContext,
      ProblemPersistenceMapper,
      TestCasePersistenceMapper,
      TestCaseTypeOrmRepository,
      HarnessTypeOrmRepository,
      ProblemReferenceReaderAdapter,
    ];
    const stubbed: unknown[] = [
      PROBLEM_REPOSITORY,
      TEST_CASE_REPOSITORY,
      HARNESS_REPOSITORY,
      TOPIC_TAG_READER,
      TRANSACTION_RUNNER,
      PROBLEM_REFERENCE_READER,
    ];
    const providers = (Reflect.getMetadata('providers', ProblemsModule) as Provider[]).filter(
      (provider) =>
        !adapters.includes(provider) && !stubbed.includes((provider as ModuleProvider).provide),
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        ...providers,
        ...stubbed.map((token) => ({ provide: token as symbol, useValue: {} })),
      ],
    }).compile();

    for (const [token, useCase] of INBOUND_BINDINGS) {
      expect(moduleRef.get(token, { strict: false })).toBeInstanceOf(useCase);
    }
  });
});
