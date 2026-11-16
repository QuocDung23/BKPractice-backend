import type { AddressInfo } from 'node:net';

import { ConcurrentModificationError } from '@learning/modules/problems/application/errors/concurrent-modification.error';
import { CREATE_PROBLEM_PORT_IN } from '@learning/modules/problems/application/ports/in/create-problem.port.in';
import { GET_MANAGED_PROBLEM_PORT_IN } from '@learning/modules/problems/application/ports/in/get-managed-problem.port.in';
import { GET_PUBLIC_PROBLEM_PORT_IN } from '@learning/modules/problems/application/ports/in/get-public-problem.port.in';
import { HOLD_PROBLEM_PORT_IN } from '@learning/modules/problems/application/ports/in/hold-problem.port.in';
import { LIST_MANAGED_PROBLEMS_PORT_IN } from '@learning/modules/problems/application/ports/in/list-managed-problems.port.in';
import { LIST_PUBLIC_PROBLEMS_PORT_IN } from '@learning/modules/problems/application/ports/in/list-public-problems.port.in';
import { PREVIEW_PROBLEM_PORT_IN } from '@learning/modules/problems/application/ports/in/preview-problem.port.in';
import { PUBLISH_PROBLEM_PORT_IN } from '@learning/modules/problems/application/ports/in/publish-problem.port.in';
import { REPUBLISH_PROBLEM_PORT_IN } from '@learning/modules/problems/application/ports/in/republish-problem.port.in';
import { RESTORE_PROBLEM_PORT_IN } from '@learning/modules/problems/application/ports/in/restore-problem.port.in';
import { SOFT_DELETE_PROBLEM_PORT_IN } from '@learning/modules/problems/application/ports/in/soft-delete-problem.port.in';
import { UPDATE_PROBLEM_PORT_IN } from '@learning/modules/problems/application/ports/in/update-problem.port.in';
import type { TopicTagReader } from '@learning/modules/problems/application/ports/out/topic-tag-reader.port.out';
import type { TransactionRunner } from '@learning/modules/problems/application/ports/out/transaction-runner.port.out';
import { ProblemResultMapper } from '@learning/modules/problems/application/results/problem-result.mapper';
import { ProblemAuthorizationService } from '@learning/modules/problems/application/services/problem-authorization.service';
import { CreateProblemUseCase } from '@learning/modules/problems/application/use-cases/create-problem.use-case';
import { GetManagedProblemUseCase } from '@learning/modules/problems/application/use-cases/get-managed-problem.use-case';
import { GetPublicProblemUseCase } from '@learning/modules/problems/application/use-cases/get-public-problem.use-case';
import { HoldProblemUseCase } from '@learning/modules/problems/application/use-cases/hold-problem.use-case';
import { ListManagedProblemsUseCase } from '@learning/modules/problems/application/use-cases/list-managed-problems.use-case';
import { ListPublicProblemsUseCase } from '@learning/modules/problems/application/use-cases/list-public-problems.use-case';
import { PreviewProblemUseCase } from '@learning/modules/problems/application/use-cases/preview-problem.use-case';
import { PublishProblemUseCase } from '@learning/modules/problems/application/use-cases/publish-problem.use-case';
import { RepublishProblemUseCase } from '@learning/modules/problems/application/use-cases/republish-problem.use-case';
import { RestoreProblemUseCase } from '@learning/modules/problems/application/use-cases/restore-problem.use-case';
import { SoftDeleteProblemUseCase } from '@learning/modules/problems/application/use-cases/soft-delete-problem.use-case';
import { UpdateProblemUseCase } from '@learning/modules/problems/application/use-cases/update-problem.use-case';
import { Problem } from '@learning/modules/problems/domain/problem.aggregate';
import type { ProblemSnapshot } from '@learning/modules/problems/domain/problem.aggregate';
import type { ProblemRepository } from '@learning/modules/problems/domain/repositories/problem.repository.port.out';
import type {
  ManagedProblemListFilter,
  ProblemListFilter,
  ProblemPage,
} from '@learning/modules/problems/domain/repositories/problem.repository.port.out';
import type {
  SampleTestCase,
  TestCaseRepository,
} from '@learning/modules/problems/domain/repositories/test-case.repository.port.out';
import { ContentFormatValidator } from '@learning/modules/problems/domain/services/content-format.validator';
import { ProblemContractValidator } from '@learning/modules/problems/domain/services/problem-contract.validator';
import { PublishValidator } from '@learning/modules/problems/domain/services/publish.validator';
import { snapshotOf } from '@learning/modules/problems/domain/testing/problem-test.factory';
import { TestSuiteSummary } from '@learning/modules/problems/domain/value-objects';
import { ManagedProblemsController } from '@learning/modules/problems/presentation/http/managed-problems.controller';
import { ProblemRequestMapper } from '@learning/modules/problems/presentation/http/mappers/problem-request.mapper';
import { ProblemResponseMapper } from '@learning/modules/problems/presentation/http/mappers/problem-response.mapper';
import { PublicProblemsController } from '@learning/modules/problems/presentation/http/public-problems.controller';
import {
  PROBLEM_REPOSITORY,
  TEST_CASE_REPOSITORY,
  TOPIC_TAG_READER,
  TRANSACTION_RUNNER,
} from '@learning/modules/problems/problem.tokens';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';

export const ADMIN_A_ID = '00000000-0000-4000-8000-000000000031';
export const ADMIN_B_ID = '00000000-0000-4000-8000-000000000032';
export const STUDENT_ID = '00000000-0000-4000-8000-000000000041';
export const HIDDEN_EXPECTED_OUTPUT = 'hidden-expected-output-must-never-leak';

const ALL_PROBLEM_PERMISSIONS = [
  'problem:create',
  'problem:read-managed',
  'problem:update',
  'problem:publish',
  'problem:hold',
  'problem:republish',
  'problem:delete',
  'problem:restore',
].join(',');

export interface AuthHeaders {
  readonly [key: string]: string;
}

export function principalHeaders(userId: string, roles: string, permissions?: string): AuthHeaders {
  return {
    'content-type': 'application/json',
    'x-auth-user-id': userId,
    'x-auth-roles': roles,
    ...(permissions === undefined ? {} : { 'x-auth-permissions': permissions }),
  };
}

export function adminHeaders(userId = ADMIN_A_ID): AuthHeaders {
  return principalHeaders(userId, 'ADMIN', ALL_PROBLEM_PERMISSIONS);
}

export function studentHeaders(): AuthHeaders {
  return {
    'content-type': 'application/json',
    'x-auth-user-id': STUDENT_ID,
    'x-auth-roles': 'STUDENT',
  };
}

export function createProblemPayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    slug: 'two-sum',
    title: 'Two Sum',
    statement: 'Return the indices of the two numbers that add up to the target.',
    inputSpecification: 'An array of integers and a target integer.',
    outputSpecification: 'The two indices.',
    problemType: 'STANDARD',
    difficulty: 'EASY',
    enabledLanguages: ['python'],
    ...overrides,
  };
}

export class InMemoryProblemRepository implements ProblemRepository {
  private readonly stored = new Map<string, ProblemSnapshot>();
  private readonly summaries = new Map<string, TestSuiteSummary>();

  clear(): void {
    this.stored.clear();
    this.summaries.clear();
  }

  setSummary(problemId: string, summary: TestSuiteSummary): void {
    this.summaries.set(problemId, summary);
  }

  storedSnapshot(id: string): ProblemSnapshot | undefined {
    return this.stored.get(id);
  }

  async findById(id: string): Promise<Problem | null> {
    const snapshot = this.stored.get(id);

    if (snapshot === undefined || snapshot.deletedMarker.isDeleted) {
      return null;
    }

    return Problem.rehydrate(snapshot);
  }

  async findByIdIncludingDeleted(id: string): Promise<Problem | null> {
    const snapshot = this.stored.get(id);

    return snapshot === undefined ? null : Problem.rehydrate(snapshot);
  }

  async findPublishedByIdOrSlug(idOrSlug: string): Promise<Problem | null> {
    const snapshot = [...this.stored.values()].find(
      (item) =>
        !item.deletedMarker.isDeleted &&
        item.publishStatus === 'PUBLISHED' &&
        (item.id.value === idOrSlug || item.slug.value === idOrSlug),
    );

    return snapshot === undefined ? null : Problem.rehydrate(snapshot);
  }

  async findManagedById(id: string, includeDeleted: boolean): Promise<Problem | null> {
    const snapshot = this.stored.get(id);

    if (snapshot === undefined || (snapshot.deletedMarker.isDeleted && !includeDeleted)) {
      return null;
    }

    return Problem.rehydrate(snapshot);
  }

  async loadForUpdate(id: string, includeDeleted = false): Promise<Problem | null> {
    return includeDeleted ? this.findByIdIncludingDeleted(id) : this.findById(id);
  }

  async loadTestSuiteSummary(problemId: string): Promise<TestSuiteSummary> {
    return this.summaries.get(problemId) ?? defaultSummary();
  }

  async loadTestSuiteSummaries(
    problemIds: readonly string[],
  ): Promise<ReadonlyMap<string, TestSuiteSummary>> {
    return new Map(problemIds.map((problemId) => [problemId, this.summaryFor(problemId)]));
  }

  async listPublished(filter: ProblemListFilter): Promise<ProblemPage<Problem>> {
    const items = [...this.stored.values()]
      .filter((item) => !item.deletedMarker.isDeleted && item.publishStatus === 'PUBLISHED')
      .filter((item) => matchesFilter(item, filter))
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

    return paginate(items, filter.page, filter.limit);
  }

  async listManaged(filter: ManagedProblemListFilter): Promise<ProblemPage<Problem>> {
    const items = [...this.stored.values()]
      .filter((item) => filter.includeDeleted || !item.deletedMarker.isDeleted)
      .filter((item) => !filter.createdBy || item.createdBy.value === filter.createdBy)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

    return paginate(items, filter.page, filter.limit);
  }

  async isSlugAvailable(slug: string, excludeProblemId?: string): Promise<boolean> {
    return ![...this.stored.values()].some(
      (item) => item.slug.value === slug && item.id.value !== excludeProblemId,
    );
  }

  async save(problem: Problem, expectedUpdatedAt?: Date): Promise<void> {
    const current = this.stored.get(problem.id.value);

    if (
      expectedUpdatedAt !== undefined &&
      current !== undefined &&
      current.updatedAt.getTime() !== expectedUpdatedAt.getTime()
    ) {
      throw new ConcurrentModificationError();
    }

    this.stored.set(problem.id.value, snapshotOf(problem));
  }

  async softDelete(id: string, at: Date): Promise<boolean> {
    const snapshot = this.stored.get(id);

    if (snapshot === undefined || snapshot.deletedMarker.isDeleted) {
      return false;
    }

    const problem = Problem.rehydrate(snapshot);
    problem.softDelete(at);
    this.stored.set(id, snapshotOf(problem));

    return true;
  }

  async restore(id: string, at: Date): Promise<boolean> {
    const snapshot = this.stored.get(id);

    if (snapshot === undefined || !snapshot.deletedMarker.isDeleted) {
      return false;
    }

    const problem = Problem.rehydrate(snapshot);
    problem.restore(at);
    this.stored.set(id, snapshotOf(problem));

    return true;
  }

  private summaryFor(problemId: string): TestSuiteSummary {
    return this.summaries.get(problemId) ?? defaultSummary();
  }
}

export class InMemoryTestCaseRepository implements TestCaseRepository {
  private samples: readonly SampleTestCase[] = [];
  private hiddenExpectedOutputs: readonly string[] = [];

  clear(): void {
    this.samples = [];
    this.hiddenExpectedOutputs = [];
  }

  setSamples(samples: readonly SampleTestCase[]): void {
    this.samples = samples;
  }

  setHiddenExpectedOutputs(values: readonly string[]): void {
    this.hiddenExpectedOutputs = values;
  }

  hiddenExpectedOutputValues(): readonly string[] {
    return this.hiddenExpectedOutputs;
  }

  async findById(): Promise<null> {
    return null;
  }

  async listByProblem(): Promise<[]> {
    return [];
  }

  async listSamples(): Promise<readonly SampleTestCase[]> {
    return this.samples;
  }

  async listForJudge(): Promise<[]> {
    return [];
  }

  async add(): Promise<void> {
    return undefined;
  }

  async update(): Promise<void> {
    return undefined;
  }

  async remove(): Promise<boolean> {
    return true;
  }

  async reorder(): Promise<void> {
    return undefined;
  }
}

export class InMemoryTopicTagReader implements TopicTagReader {
  async findMissingTopicIds(): Promise<readonly string[]> {
    return [];
  }

  async findMissingTagIds(): Promise<readonly string[]> {
    return [];
  }

  async findTopicNames(ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
    return new Map(ids.map((id) => [id, `topic-${id}`]));
  }

  async findTagNames(ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
    return new Map(ids.map((id) => [id, `tag-${id}`]));
  }
}

export class InlineTransactionRunner implements TransactionRunner {
  async run<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }
}

export interface ProblemsTestApp {
  readonly app: NestExpressApplication;
  readonly baseUrl: string;
  readonly problems: InMemoryProblemRepository;
  readonly testCases: InMemoryTestCaseRepository;
  readonly close: () => Promise<void>;
}

export async function createProblemsTestApp(): Promise<ProblemsTestApp> {
  const problems = new InMemoryProblemRepository();
  const testCases = new InMemoryTestCaseRepository();
  const topicTags = new InMemoryTopicTagReader();
  const transactions = new InlineTransactionRunner();

  const moduleRef = await Test.createTestingModule({
    controllers: [ManagedProblemsController, PublicProblemsController],
    providers: [
      ProblemAuthorizationService,
      ProblemResultMapper,
      ProblemRequestMapper,
      ProblemResponseMapper,
      { provide: ContentFormatValidator, useFactory: () => new ContentFormatValidator() },
      { provide: ProblemContractValidator, useFactory: () => new ProblemContractValidator() },
      {
        provide: PublishValidator,
        useFactory: (contractValidator: ProblemContractValidator) =>
          new PublishValidator(contractValidator),
        inject: [ProblemContractValidator],
      },
      CreateProblemUseCase,
      UpdateProblemUseCase,
      PublishProblemUseCase,
      HoldProblemUseCase,
      RepublishProblemUseCase,
      SoftDeleteProblemUseCase,
      RestoreProblemUseCase,
      GetManagedProblemUseCase,
      ListManagedProblemsUseCase,
      GetPublicProblemUseCase,
      ListPublicProblemsUseCase,
      PreviewProblemUseCase,
      { provide: PROBLEM_REPOSITORY, useValue: problems },
      { provide: TEST_CASE_REPOSITORY, useValue: testCases },
      { provide: TOPIC_TAG_READER, useValue: topicTags },
      { provide: TRANSACTION_RUNNER, useValue: transactions },
      { provide: CREATE_PROBLEM_PORT_IN, useExisting: CreateProblemUseCase },
      { provide: UPDATE_PROBLEM_PORT_IN, useExisting: UpdateProblemUseCase },
      { provide: PUBLISH_PROBLEM_PORT_IN, useExisting: PublishProblemUseCase },
      { provide: HOLD_PROBLEM_PORT_IN, useExisting: HoldProblemUseCase },
      { provide: REPUBLISH_PROBLEM_PORT_IN, useExisting: RepublishProblemUseCase },
      { provide: SOFT_DELETE_PROBLEM_PORT_IN, useExisting: SoftDeleteProblemUseCase },
      { provide: RESTORE_PROBLEM_PORT_IN, useExisting: RestoreProblemUseCase },
      { provide: GET_MANAGED_PROBLEM_PORT_IN, useExisting: GetManagedProblemUseCase },
      { provide: LIST_MANAGED_PROBLEMS_PORT_IN, useExisting: ListManagedProblemsUseCase },
      { provide: GET_PUBLIC_PROBLEM_PORT_IN, useExisting: GetPublicProblemUseCase },
      { provide: LIST_PUBLIC_PROBLEMS_PORT_IN, useExisting: ListPublicProblemsUseCase },
      { provide: PREVIEW_PROBLEM_PORT_IN, useExisting: PreviewProblemUseCase },
    ],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
  );
  await app.listen(0, '127.0.0.1');

  const address = (app.getHttpServer() as { address(): AddressInfo | string | null }).address();

  if (address === null || typeof address === 'string') {
    throw new Error('Expected an ephemeral TCP port');
  }

  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}`,
    problems,
    testCases,
    close: () => app.close(),
  };
}

function defaultSummary(): TestSuiteSummary {
  return new TestSuiteSummary({
    totalCount: 1,
    hiddenCount: 1,
    totalScore: 1,
    totalBytes: 0,
    harnessLanguages: [],
  });
}

function matchesFilter(snapshot: ProblemSnapshot, filter: ProblemListFilter): boolean {
  if (filter.problemType !== undefined && snapshot.problemType !== filter.problemType) {
    return false;
  }

  if (filter.difficulty !== undefined && snapshot.difficulty !== filter.difficulty) {
    return false;
  }

  if (filter.search !== undefined) {
    const needle = filter.search.toLowerCase();

    if (!snapshot.title.value.toLowerCase().includes(needle)) {
      return false;
    }
  }

  if (
    filter.topicId !== undefined &&
    !snapshot.topics.some((topic) => topic.value === filter.topicId)
  ) {
    return false;
  }

  if (filter.tagId !== undefined && !snapshot.tags.some((tag) => tag.value === filter.tagId)) {
    return false;
  }

  return true;
}

function paginate(
  items: readonly ProblemSnapshot[],
  page: number,
  limit: number,
): ProblemPage<Problem> {
  const start = (page - 1) * limit;
  const slice = items.slice(start, start + limit);

  return {
    items: slice.map((snapshot) => Problem.rehydrate(snapshot)),
    total: items.length,
    page,
    limit,
  };
}
