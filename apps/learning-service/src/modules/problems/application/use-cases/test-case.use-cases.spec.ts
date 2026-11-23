import type { SupportedLanguage } from '@app/contracts';
import type { SetHarnessCommand } from '@learning/modules/problems/application/command/test-case.commands';
import { HarnessNotFoundError } from '@learning/modules/problems/application/errors/harness-not-found.error';
import { ProblemNotFoundError } from '@learning/modules/problems/application/errors/problem-not-found.error';
import { PublishNotReadyError } from '@learning/modules/problems/application/errors/publish-not-ready.error';
import { TestCaseNotFoundError } from '@learning/modules/problems/application/errors/test-case-not-found.error';
import type { TransactionRunner } from '@learning/modules/problems/application/ports/out/transaction-runner.port.out';
import type { ProblemAuthorizationService } from '@learning/modules/problems/application/services/problem-authorization.service';
import { InvalidProblemState } from '@learning/modules/problems/domain/errors/invalid-problem-state.error';
import { Harness } from '@learning/modules/problems/domain/harness.aggregate';
import { TestCase } from '@learning/modules/problems/domain/test-case.aggregate';
import {
  buildProblem,
  languages,
  TEST_USER_ID,
} from '@learning/modules/problems/domain/testing/problem-test.factory';
import {
  DisplayOrder,
  ExpectedOutput,
  HarnessSource,
  ProblemId,
  TestCaseId,
  TestCaseInput,
  TestCaseScore,
  TestCaseVisibility,
  TestSuiteSummary,
} from '@learning/modules/problems/domain/value-objects';

import { AddTestCaseUseCase } from './add-test-case.use-case';
import { BuildJudgePackageUseCase } from './build-judge-package.use-case';
import { GetHarnessUseCase } from './get-harness.use-case';
import { GetTestCaseUseCase } from './get-test-case.use-case';
import { ListTestCasesUseCase } from './list-test-cases.use-case';
import { RemoveHarnessUseCase } from './remove-harness.use-case';
import { RemoveTestCaseUseCase } from './remove-test-case.use-case';
import { ReorderTestCasesUseCase } from './reorder-test-cases.use-case';
import { SetHarnessUseCase } from './set-harness.use-case';
import { UpdateTestCaseUseCase } from './update-test-case.use-case';

const CASE_ID = '00000000-0000-4000-8000-000000000011';
const SECOND_CASE_ID = '00000000-0000-4000-8000-000000000012';
const PRINCIPAL = {
  userId: TEST_USER_ID,
  roles: ['ADMIN'],
  permissions: ['problem:update', 'problem:read-managed'],
};

describe('AddTestCaseUseCase', () => {
  it('adds a hidden test case at the end and checks published readiness', async () => {
    const { useCase, repository, testCaseRepository, readiness } = createAddUseCase();
    const problem = buildProblem({ enabledLanguages: languages('python') });

    repository.loadForUpdate.mockResolvedValue(problem);
    repository.loadTestSuiteSummary.mockResolvedValue(TestSuiteSummary.empty());
    testCaseRepository.listByProblem.mockResolvedValue([]);

    const result = await useCase.execute(PRINCIPAL, problem.id.value, addCommand());

    expect(result).toMatchObject({
      input: '1 2',
      expectedOutput: '3',
      visibility: 'HIDDEN',
      score: 5,
      displayOrder: 0,
    });
    expect(testCaseRepository.add).toHaveBeenCalledWith(expect.any(TestCase));
    expect(readiness.assertReadyWhenPublished).toHaveBeenCalledWith(problem);
  });

  it('rejects a duplicate display order before writing', async () => {
    const { useCase, repository, testCaseRepository } = createAddUseCase();
    const problem = buildProblem({ enabledLanguages: languages('python') });
    const existing = existingTestCase(problem, SECOND_CASE_ID, 1, 2);

    repository.loadForUpdate.mockResolvedValue(problem);
    repository.loadTestSuiteSummary.mockResolvedValue(TestSuiteSummary.empty());
    testCaseRepository.listByProblem.mockResolvedValue([existing]);

    await expect(
      useCase.execute(PRINCIPAL, problem.id.value, {
        ...addCommand(),
        displayOrder: new DisplayOrder(2),
      }),
    ).rejects.toMatchObject({ code: 'DOMAIN_VALIDATION' });
    expect(testCaseRepository.add).not.toHaveBeenCalled();
  });

  it('rejects the 101st test case before writing', async () => {
    const { useCase, repository, testCaseRepository } = createAddUseCase();
    const problem = buildProblem({ enabledLanguages: languages('python') });

    repository.loadForUpdate.mockResolvedValue(problem);
    repository.loadTestSuiteSummary.mockResolvedValue(
      new TestSuiteSummary({
        totalCount: 100,
        hiddenCount: 100,
        totalScore: 100,
        totalBytes: 0,
      }),
    );
    testCaseRepository.listByProblem.mockResolvedValue([]);

    await expect(useCase.execute(PRINCIPAL, problem.id.value, addCommand())).rejects.toMatchObject({
      code: 'DOMAIN_VALIDATION',
    });
    expect(testCaseRepository.add).not.toHaveBeenCalled();
  });

  it('rejects an on-hold problem', async () => {
    const { useCase, repository, testCaseRepository } = createAddUseCase();
    const problem = buildProblem({ enabledLanguages: languages('python') });
    problem.publish();
    problem.hold();
    repository.loadForUpdate.mockResolvedValue(problem);

    await expect(useCase.execute(PRINCIPAL, problem.id.value, addCommand())).rejects.toMatchObject({
      code: 'INVALID_PROBLEM_STATE',
    });
    expect(testCaseRepository.add).not.toHaveBeenCalled();
  });
});

describe('UpdateTestCaseUseCase', () => {
  it('updates a test case and rechecks published readiness', async () => {
    const { useCase, repository, testCaseRepository, readiness } = createUpdateUseCase();
    const problem = buildProblem({ enabledLanguages: languages('python') });
    const testCase = existingTestCase(problem, CASE_ID, 5, 0);
    repository.loadForUpdate.mockResolvedValue(problem);
    testCaseRepository.findById.mockResolvedValue(testCase);
    repository.loadTestSuiteSummary.mockResolvedValue(summaryFor(testCase));

    const result = await useCase.execute(PRINCIPAL, problem.id.value, CASE_ID, {
      input: new TestCaseInput('2 3'),
    });

    expect(result.input).toBe('2 3');
    expect(testCase.input.value).toBe('2 3');
    expect(testCaseRepository.update).toHaveBeenCalledWith(testCase);
    expect(readiness.assertReadyWhenPublished).toHaveBeenCalledWith(problem);
  });

  it('updates the display order when supplied', async () => {
    const { useCase, repository, testCaseRepository } = createUpdateUseCase();
    const problem = buildProblem({ enabledLanguages: languages('python') });
    const testCase = existingTestCase(problem, CASE_ID, 5, 0);
    repository.loadForUpdate.mockResolvedValue(problem);
    testCaseRepository.findById.mockResolvedValue(testCase);
    repository.loadTestSuiteSummary.mockResolvedValue(summaryFor(testCase));

    const result = await useCase.execute(PRINCIPAL, problem.id.value, CASE_ID, {
      displayOrder: new DisplayOrder(2),
    });

    expect(result.displayOrder).toBe(2);
    expect(testCaseRepository.update).toHaveBeenCalledWith(testCase);
  });

  it('rejects a duplicate display order before writing', async () => {
    const { useCase, repository, testCaseRepository } = createUpdateUseCase();
    const problem = buildProblem({ enabledLanguages: languages('python') });
    const testCase = existingTestCase(problem, CASE_ID, 5, 0);
    const other = existingTestCase(problem, SECOND_CASE_ID, 1, 2);
    repository.loadForUpdate.mockResolvedValue(problem);
    testCaseRepository.findById.mockResolvedValue(testCase);
    testCaseRepository.listByProblem.mockResolvedValue([testCase, other]);
    repository.loadTestSuiteSummary.mockResolvedValue(summaryFor(testCase));

    await expect(
      useCase.execute(PRINCIPAL, problem.id.value, CASE_ID, {
        displayOrder: new DisplayOrder(2),
      }),
    ).rejects.toMatchObject({ code: 'DOMAIN_VALIDATION' });
    expect(testCaseRepository.update).not.toHaveBeenCalled();
  });

  it('returns 404 when the test case does not belong to the problem', async () => {
    const { useCase, repository, testCaseRepository } = createUpdateUseCase();
    const problem = buildProblem();
    repository.loadForUpdate.mockResolvedValue(problem);
    testCaseRepository.findById.mockResolvedValue(null);

    await expect(
      useCase.execute(PRINCIPAL, problem.id.value, CASE_ID, { input: new TestCaseInput('2') }),
    ).rejects.toBeInstanceOf(TestCaseNotFoundError);
    expect(testCaseRepository.update).not.toHaveBeenCalled();
  });

  it('does not write when the published problem would become unready', async () => {
    const { useCase, repository, testCaseRepository, readiness } = createUpdateUseCase();
    const problem = buildProblem({ enabledLanguages: languages('python') });
    const testCase = existingTestCase(problem, CASE_ID, 5, 0);
    problem.publish();
    repository.loadForUpdate.mockResolvedValue(problem);
    testCaseRepository.findById.mockResolvedValue(testCase);
    repository.loadTestSuiteSummary.mockResolvedValue(summaryFor(testCase));
    readiness.assertReadyWhenPublished.mockImplementation(() => {
      throw new PublishNotReadyError([{ code: 'TEST_CASE_HIDDEN_REQUIRED', message: 'missing' }]);
    });

    await expect(
      useCase.execute(PRINCIPAL, problem.id.value, CASE_ID, {
        visibility: new TestCaseVisibility('SAMPLE'),
      }),
    ).rejects.toBeInstanceOf(PublishNotReadyError);
    expect(testCase.visibility.value).toBe('HIDDEN');
    expect(testCaseRepository.update).not.toHaveBeenCalled();
  });
});

describe('RemoveTestCaseUseCase', () => {
  it('removes a test case', async () => {
    const { useCase, repository, testCaseRepository } = createRemoveUseCase();
    const problem = buildProblem({ enabledLanguages: languages('python') });
    const testCase = existingTestCase(problem, CASE_ID, 5, 0);
    repository.loadForUpdate.mockResolvedValue(problem);
    testCaseRepository.findById.mockResolvedValue(testCase);
    repository.loadTestSuiteSummary.mockResolvedValue(summaryFor(testCase));
    testCaseRepository.remove.mockResolvedValue(true);

    await useCase.execute(PRINCIPAL, problem.id.value, CASE_ID);

    expect(testCaseRepository.remove).toHaveBeenCalledWith(problem.id.value, CASE_ID);
  });

  it('does not remove the last hidden test case of a published problem', async () => {
    const { useCase, repository, testCaseRepository, readiness } = createRemoveUseCase();
    const problem = buildProblem({ enabledLanguages: languages('python') });
    const testCase = existingTestCase(problem, CASE_ID, 5, 0);
    problem.publish();
    repository.loadForUpdate.mockResolvedValue(problem);
    testCaseRepository.findById.mockResolvedValue(testCase);
    repository.loadTestSuiteSummary.mockResolvedValue(summaryFor(testCase));
    readiness.assertReadyWhenPublished.mockImplementation(() => {
      throw new PublishNotReadyError([{ code: 'TEST_CASE_HIDDEN_REQUIRED', message: 'missing' }]);
    });

    await expect(useCase.execute(PRINCIPAL, problem.id.value, CASE_ID)).rejects.toBeInstanceOf(
      PublishNotReadyError,
    );
    expect(testCaseRepository.remove).not.toHaveBeenCalled();
  });
});

describe('ReorderTestCasesUseCase', () => {
  it('reorders a complete permutation and returns the new order', async () => {
    const { useCase, repository, testCaseRepository } = createReorderUseCase();
    const problem = buildProblem();
    const first = existingTestCase(problem, CASE_ID, 5, 0);
    const second = existingTestCase(problem, SECOND_CASE_ID, 5, 1);
    repository.loadForUpdate.mockResolvedValue(problem);
    testCaseRepository.listByProblem
      .mockResolvedValueOnce([first, second])
      .mockResolvedValueOnce([second, first]);

    const result = await useCase.execute(PRINCIPAL, problem.id.value, {
      testCaseIds: [second.id, first.id],
    });

    expect(testCaseRepository.reorder).toHaveBeenCalledWith(problem.id.value, [
      SECOND_CASE_ID,
      CASE_ID,
    ]);
    expect(result.map((item) => item.id)).toEqual([SECOND_CASE_ID, CASE_ID]);
  });

  it('rejects an incomplete or duplicated permutation', async () => {
    const { useCase, repository, testCaseRepository } = createReorderUseCase();
    const problem = buildProblem();
    repository.loadForUpdate.mockResolvedValue(problem);
    testCaseRepository.listByProblem.mockResolvedValue([
      existingTestCase(problem, CASE_ID, 5, 0),
      existingTestCase(problem, SECOND_CASE_ID, 5, 1),
    ]);

    await expect(
      useCase.execute(PRINCIPAL, problem.id.value, {
        testCaseIds: [TestCaseId.from(CASE_ID), TestCaseId.from(CASE_ID)],
      }),
    ).rejects.toMatchObject({ code: 'DOMAIN_VALIDATION' });
    expect(testCaseRepository.reorder).not.toHaveBeenCalled();
  });
});

describe('ListTestCasesUseCase and GetTestCaseUseCase', () => {
  it('lists test cases with the suite summary', async () => {
    const { useCase, repository, testCaseRepository } = createListUseCase();
    const problem = buildProblem();
    const testCase = existingTestCase(problem, CASE_ID, 5, 0);
    repository.findById.mockResolvedValue(problem);
    testCaseRepository.listByProblem.mockResolvedValue([testCase]);
    repository.loadTestSuiteSummary.mockResolvedValue(summaryFor(testCase));

    await expect(useCase.execute(PRINCIPAL, problem.id.value)).resolves.toMatchObject({
      items: [{ id: CASE_ID }],
      testSuiteSummary: { totalCount: 1, hiddenCount: 1, totalScore: 5 },
    });
  });

  it('gets one test case and returns 404 when it is missing', async () => {
    const { useCase, repository, testCaseRepository } = createGetUseCase();
    const problem = buildProblem();
    const testCase = existingTestCase(problem, CASE_ID, 5, 0);
    repository.findById.mockResolvedValue(problem);
    testCaseRepository.findById.mockResolvedValueOnce(testCase).mockResolvedValueOnce(null);

    await expect(useCase.execute(PRINCIPAL, problem.id.value, CASE_ID)).resolves.toMatchObject({
      id: CASE_ID,
    });
    await expect(
      useCase.execute(PRINCIPAL, problem.id.value, SECOND_CASE_ID),
    ).rejects.toBeInstanceOf(TestCaseNotFoundError);
  });
});

describe('SetHarnessUseCase and RemoveHarnessUseCase', () => {
  it('sets and replaces a harness for an enabled FUNCTION language', async () => {
    const { useCase, repository, harnessRepository, readiness } = createSetHarnessUseCase();
    const problem = functionProblem();
    repository.loadForUpdate.mockResolvedValue(problem);
    repository.loadTestSuiteSummary.mockResolvedValue(TestSuiteSummary.empty());
    harnessRepository.find.mockResolvedValue(null);

    const result = await useCase.execute(PRINCIPAL, problem.id.value, harnessCommand('python'));

    expect(result).toEqual({ language: 'python', source: 'harness' });
    expect(harnessRepository.upsert).toHaveBeenCalledWith(expect.any(Harness));
    expect(readiness.assertReadyWhenPublished).toHaveBeenCalledWith(problem);
  });

  it('rejects STANDARD problems', async () => {
    const { useCase, repository } = createSetHarnessUseCase();
    const standard = buildProblem({ enabledLanguages: languages('python') });
    repository.loadForUpdate.mockResolvedValue(standard);

    await expect(
      useCase.execute(PRINCIPAL, standard.id.value, harnessCommand('python')),
    ).rejects.toMatchObject({ code: 'DOMAIN_VALIDATION' });
  });

  it('stages a harness for a language that is not enabled yet without touching the summary', async () => {
    const { useCase, repository, harnessRepository, readiness } = createSetHarnessUseCase();
    const problem = functionProblem();
    repository.loadForUpdate.mockResolvedValue(problem);

    const result = await useCase.execute(PRINCIPAL, problem.id.value, harnessCommand('java'));

    expect(result).toEqual({ language: 'java', source: 'harness' });
    expect(harnessRepository.upsert).toHaveBeenCalledWith(expect.any(Harness));
    expect(repository.loadTestSuiteSummary).not.toHaveBeenCalled();
    expect(readiness.assertReadyWhenPublished).not.toHaveBeenCalled();
  });

  it('removes an existing harness even when the language is disabled', async () => {
    const { useCase, repository, harnessRepository } = createRemoveHarnessUseCase();
    const problem = functionProblem();
    problem.update({ enabledLanguages: [] });
    const harness = Harness.create({
      problemId: problem.id,
      language: 'python',
      source: new HarnessSource('harness'),
    });
    repository.loadForUpdate.mockResolvedValue(problem);
    harnessRepository.find.mockResolvedValue(harness);
    harnessRepository.remove.mockResolvedValue(true);

    await useCase.execute(PRINCIPAL, problem.id.value, 'python');

    expect(repository.loadTestSuiteSummary).not.toHaveBeenCalled();
    expect(harnessRepository.remove).toHaveBeenCalledWith(problem.id.value, 'python');
  });

  it('does not remove a harness when a published problem becomes unready', async () => {
    const { useCase, repository, harnessRepository, readiness } = createRemoveHarnessUseCase();
    const problem = functionProblem();
    problem.publish();
    const harness = Harness.create({
      problemId: problem.id,
      language: 'python',
      source: new HarnessSource('harness'),
    });
    repository.loadForUpdate.mockResolvedValue(problem);
    harnessRepository.find.mockResolvedValue(harness);
    repository.loadTestSuiteSummary.mockResolvedValue(
      new TestSuiteSummary({
        totalCount: 0,
        hiddenCount: 0,
        totalScore: 0,
        totalBytes: 7,
        harnessLanguages: ['python'],
      }),
    );
    readiness.assertReadyWhenPublished.mockImplementation(() => {
      throw new PublishNotReadyError([{ code: 'HARNESS_REQUIRED', message: 'missing' }]);
    });

    await expect(useCase.execute(PRINCIPAL, problem.id.value, 'python')).rejects.toBeInstanceOf(
      PublishNotReadyError,
    );
    expect(harnessRepository.remove).not.toHaveBeenCalled();
  });

  it('gets a harness and returns 404 when it is missing', async () => {
    const { useCase, repository, harnessRepository } = createGetHarnessUseCase();
    const problem = functionProblem();
    const harness = Harness.create({
      problemId: problem.id,
      language: 'python',
      source: new HarnessSource('harness'),
    });
    repository.findById.mockResolvedValue(problem);
    harnessRepository.find.mockResolvedValueOnce(harness).mockResolvedValueOnce(null);

    await expect(useCase.execute(PRINCIPAL, problem.id.value, 'python')).resolves.toEqual({
      language: 'python',
      source: 'harness',
    });
    await expect(useCase.execute(PRINCIPAL, problem.id.value, 'java')).rejects.toBeInstanceOf(
      HarnessNotFoundError,
    );
  });
});

describe('BuildJudgePackageUseCase', () => {
  it('returns all test cases in order and the harness for a FUNCTION problem', async () => {
    const { useCase, repository, testCaseRepository, harnessRepository } = createJudgeUseCase();
    const problem = functionProblem();
    problem.publish();
    const first = existingTestCase(problem, CASE_ID, 10, 0);
    const second = existingTestCase(problem, SECOND_CASE_ID, 20, 1, 'SAMPLE');
    repository.findById.mockResolvedValue(problem);
    testCaseRepository.listForJudge.mockResolvedValue([first, second]);
    harnessRepository.find.mockResolvedValue(
      Harness.create({
        problemId: problem.id,
        language: 'python',
        source: new HarnessSource('secret'),
      }),
    );

    await expect(useCase.execute(problem.id.value, 'python')).resolves.toMatchObject({
      problemId: problem.id.value,
      problemType: 'FUNCTION',
      hiddenHarness: 'secret',
      testCases: [
        { id: CASE_ID, stdin: '1 2', expectedOutput: '3', score: 10 },
        { id: SECOND_CASE_ID, stdin: '1 2', expectedOutput: '3', score: 20 },
      ],
    });
  });

  it('omits the harness for a STANDARD problem', async () => {
    const { useCase, repository, testCaseRepository, harnessRepository } = createJudgeUseCase();
    const problem = buildProblem({ enabledLanguages: languages('python') });
    problem.publish();
    repository.findById.mockResolvedValue(problem);
    testCaseRepository.listForJudge.mockResolvedValue([]);

    const result = await useCase.execute(problem.id.value, 'python');

    expect(result).not.toHaveProperty('hiddenHarness');
    expect(harnessRepository.find).not.toHaveBeenCalled();
  });

  it('returns 404 for a draft or disabled language and 409 for a missing harness', async () => {
    const { useCase, repository, testCaseRepository, harnessRepository } = createJudgeUseCase();
    const draft = buildProblem({ enabledLanguages: languages('python') });
    repository.findById.mockResolvedValue(draft);

    await expect(useCase.execute(draft.id.value, 'python')).rejects.toBeInstanceOf(
      ProblemNotFoundError,
    );

    const published = functionProblem();
    published.publish();
    repository.findById.mockResolvedValue(published);
    testCaseRepository.listForJudge.mockResolvedValue([]);
    harnessRepository.find.mockResolvedValue(null);

    await expect(useCase.execute(published.id.value, 'python')).rejects.toBeInstanceOf(
      InvalidProblemState,
    );

    const disabled = buildProblem({
      problemType: 'FUNCTION',
      enabledLanguages: languages('python'),
    });
    disabled.publish();
    repository.findById.mockResolvedValue(disabled);

    await expect(useCase.execute(disabled.id.value, 'java')).rejects.toBeInstanceOf(
      ProblemNotFoundError,
    );
  });
});

function addCommand() {
  return {
    input: new TestCaseInput('1 2'),
    expectedOutput: new ExpectedOutput('3'),
    visibility: new TestCaseVisibility('HIDDEN'),
    score: new TestCaseScore(5),
  };
}

function harnessCommand(language: SupportedLanguage): SetHarnessCommand {
  return { language, source: new HarnessSource('harness') };
}

function existingTestCase(
  problem: ReturnType<typeof buildProblem>,
  id: string,
  score: number,
  displayOrder: number,
  visibility: 'HIDDEN' | 'SAMPLE' = 'HIDDEN',
): TestCase {
  return TestCase.create({
    id: TestCaseId.from(id),
    problemId: ProblemId.from(problem.id.value),
    input: new TestCaseInput('1 2'),
    expectedOutput: new ExpectedOutput('3'),
    visibility: new TestCaseVisibility(visibility),
    score: new TestCaseScore(score),
    displayOrder: new DisplayOrder(displayOrder),
  });
}

function summaryFor(testCase: TestCase): TestSuiteSummary {
  return new TestSuiteSummary({
    totalCount: 1,
    hiddenCount: testCase.visibility.isHidden ? 1 : 0,
    totalScore: testCase.score.value,
    totalBytes: testCase.payloadBytes,
    harnessLanguages: [],
  });
}

function functionProblem() {
  return buildProblem({
    problemType: 'FUNCTION',
    inputSpecification: null,
    outputSpecification: null,
    enabledLanguages: languages('python'),
  });
}

function authorizationMock() {
  return { requireManaged: jest.fn() };
}

function problemRepositoryMock() {
  return {
    findById: jest.fn(),
    loadForUpdate: jest.fn(),
    loadTestSuiteSummary: jest.fn().mockResolvedValue(TestSuiteSummary.empty()),
    loadTestSuiteSummaries: jest.fn().mockResolvedValue(new Map()),
    findByIdIncludingDeleted: jest.fn(),
    findPublishedByIdOrSlug: jest.fn(),
    findManagedById: jest.fn(),
    listPublished: jest.fn(),
    listManaged: jest.fn(),
    isSlugAvailable: jest.fn().mockResolvedValue(true),
    save: jest.fn(),
    softDelete: jest.fn(),
    isUsedByPublishedCourse: jest.fn(),
    restore: jest.fn(),
  };
}

function testCaseRepositoryMock() {
  return {
    findById: jest.fn(),
    listByProblem: jest.fn().mockResolvedValue([]),
    listSamples: jest.fn().mockResolvedValue([]),
    listForJudge: jest.fn().mockResolvedValue([]),
    add: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    reorder: jest.fn(),
  };
}

function harnessRepositoryMock() {
  return {
    find: jest.fn(),
    upsert: jest.fn(),
    remove: jest.fn(),
  };
}

function readinessMock() {
  return { assertReadyWhenPublished: jest.fn() };
}

function transactionRunnerMock() {
  return { run: jest.fn((work: () => Promise<unknown>) => work()) };
}

function createAddUseCase() {
  const authorization = authorizationMock();
  const repository = problemRepositoryMock();
  const testCaseRepository = testCaseRepositoryMock();
  const readiness = readinessMock();

  return {
    repository,
    testCaseRepository,
    readiness,
    useCase: new AddTestCaseUseCase(
      authorization as unknown as ProblemAuthorizationService,
      repository,
      testCaseRepository,
      readiness as never,
      transactionRunnerMock() as unknown as TransactionRunner,
    ),
  };
}

function createUpdateUseCase() {
  const authorization = authorizationMock();
  const repository = problemRepositoryMock();
  const testCaseRepository = testCaseRepositoryMock();
  const readiness = readinessMock();

  return {
    repository,
    testCaseRepository,
    readiness,
    useCase: new UpdateTestCaseUseCase(
      authorization as unknown as ProblemAuthorizationService,
      repository,
      testCaseRepository,
      readiness as never,
      transactionRunnerMock() as unknown as TransactionRunner,
    ),
  };
}

function createRemoveUseCase() {
  const authorization = authorizationMock();
  const repository = problemRepositoryMock();
  const testCaseRepository = testCaseRepositoryMock();
  const readiness = readinessMock();

  return {
    repository,
    testCaseRepository,
    readiness,
    useCase: new RemoveTestCaseUseCase(
      authorization as unknown as ProblemAuthorizationService,
      repository,
      testCaseRepository,
      readiness as never,
      transactionRunnerMock() as unknown as TransactionRunner,
    ),
  };
}

function createReorderUseCase() {
  const authorization = authorizationMock();
  const repository = problemRepositoryMock();
  const testCaseRepository = testCaseRepositoryMock();

  return {
    repository,
    testCaseRepository,
    useCase: new ReorderTestCasesUseCase(
      authorization as unknown as ProblemAuthorizationService,
      repository,
      testCaseRepository,
      transactionRunnerMock() as unknown as TransactionRunner,
    ),
  };
}

function createListUseCase() {
  const authorization = authorizationMock();
  const repository = problemRepositoryMock();
  const testCaseRepository = testCaseRepositoryMock();

  return {
    repository,
    testCaseRepository,
    useCase: new ListTestCasesUseCase(
      authorization as unknown as ProblemAuthorizationService,
      repository,
      testCaseRepository,
    ),
  };
}

function createGetUseCase() {
  const authorization = authorizationMock();
  const repository = problemRepositoryMock();
  const testCaseRepository = testCaseRepositoryMock();

  return {
    repository,
    testCaseRepository,
    useCase: new GetTestCaseUseCase(
      authorization as unknown as ProblemAuthorizationService,
      repository,
      testCaseRepository,
    ),
  };
}

function createSetHarnessUseCase() {
  const authorization = authorizationMock();
  const repository = problemRepositoryMock();
  const harnessRepository = harnessRepositoryMock();
  const readiness = readinessMock();

  return {
    repository,
    harnessRepository,
    readiness,
    useCase: new SetHarnessUseCase(
      authorization as unknown as ProblemAuthorizationService,
      repository,
      harnessRepository,
      readiness as never,
      transactionRunnerMock() as unknown as TransactionRunner,
    ),
  };
}

function createRemoveHarnessUseCase() {
  const authorization = authorizationMock();
  const repository = problemRepositoryMock();
  const harnessRepository = harnessRepositoryMock();
  const readiness = readinessMock();

  return {
    repository,
    harnessRepository,
    readiness,
    useCase: new RemoveHarnessUseCase(
      authorization as unknown as ProblemAuthorizationService,
      repository,
      harnessRepository,
      readiness as never,
      transactionRunnerMock() as unknown as TransactionRunner,
    ),
  };
}

function createGetHarnessUseCase() {
  const authorization = authorizationMock();
  const repository = problemRepositoryMock();
  const harnessRepository = harnessRepositoryMock();

  return {
    repository,
    harnessRepository,
    useCase: new GetHarnessUseCase(
      authorization as unknown as ProblemAuthorizationService,
      repository,
      harnessRepository,
    ),
  };
}

function createJudgeUseCase() {
  const repository = problemRepositoryMock();
  const testCaseRepository = testCaseRepositoryMock();
  const harnessRepository = harnessRepositoryMock();

  return {
    repository,
    testCaseRepository,
    harnessRepository,
    useCase: new BuildJudgePackageUseCase(repository, testCaseRepository, harnessRepository),
  };
}
