import type { JudgeRequest } from '@app/contracts';

import { SandboxUnavailableError } from './application/errors/sandbox-unavailable.error';
import type {
  SandboxExecution,
  SandboxFile,
  SandboxOutcome,
  SandboxPort,
  SandboxWorkspace,
} from './application/ports/out/sandbox.port';
import { JudgeEngine } from './judge.engine';
import { CRunner } from './runners/c.runner';
import { CppRunner } from './runners/cpp.runner';
import { JavaRunner } from './runners/java.runner';
import { PythonRunner } from './runners/python.runner';
import { RunnerRegistry } from './runners/runner.registry';

const request: JudgeRequest = {
  executionId: 'exec-1',
  submissionId: 'sub-1',
  mode: 'SUBMIT',
  problemType: 'STANDARD',
  language: 'python',
  sourceCode: 'print(input())',
  testCases: [{ stdin: '1', expectedOutput: '1', score: 10 }],
  timeLimitMs: 1000,
  memoryLimitMb: 128,
};

const outcome = (overrides: Partial<SandboxOutcome> = {}): SandboxOutcome => ({
  exitCode: 0,
  stdout: '1\n',
  stderr: '',
  runtimeMs: 3,
  timedOut: false,
  outputLimitExceeded: false,
  oomKilled: false,
  ...overrides,
});

class FakeSandbox implements SandboxPort {
  readonly executions: SandboxExecution[] = [];
  readonly workspaces: (readonly SandboxFile[])[] = [];
  disposed = 0;
  constructor(private readonly next: (stage: string) => Promise<SandboxOutcome>) {}
  createWorkspace(executionId: string, files: readonly SandboxFile[]): Promise<SandboxWorkspace> {
    this.workspaces.push(files);
    return Promise.resolve({ executionId });
  }
  execute(_workspace: SandboxWorkspace, execution: SandboxExecution): Promise<SandboxOutcome> {
    this.executions.push(execution);
    return this.next(execution.stage);
  }
  disposeWorkspace(): Promise<void> {
    this.disposed += 1;
    return Promise.resolve();
  }
}

const judgeWith = (next: (stage: string) => Promise<SandboxOutcome>, req = request) => {
  const sandbox = new FakeSandbox(next);
  const runners = new RunnerRegistry(
    new CRunner(),
    new CppRunner(),
    new JavaRunner(),
    new PythonRunner(),
  );
  return { sandbox, result: new JudgeEngine(runners, sandbox).judge(req) };
};

describe('JudgeEngine sandbox outcomes', () => {
  it('maps a runtime-reported OOM kill to MEMORY_LIMIT_EXCEEDED', async () => {
    const { result } = judgeWith((stage) =>
      Promise.resolve(
        stage === 'compile' ? outcome() : outcome({ exitCode: 137, oomKilled: true }),
      ),
    );
    await expect(result).resolves.toMatchObject({ status: 'MEMORY_LIMIT_EXCEEDED' });
  });

  it('maps a bare exit 137 to RUNTIME_ERROR (JDG-005-AC-015)', async () => {
    const { result } = judgeWith((stage) =>
      Promise.resolve(stage === 'compile' ? outcome() : outcome({ exitCode: 137 })),
    );
    await expect(result).resolves.toMatchObject({ status: 'RUNTIME_ERROR' });
  });

  it('maps sandbox infrastructure failure to INTERNAL_ERROR and disposes the workspace', async () => {
    const { sandbox, result } = judgeWith(() =>
      Promise.reject(new SandboxUnavailableError('test-0')),
    );
    await expect(result).resolves.toMatchObject({
      status: 'INTERNAL_ERROR',
      stderr: 'Sandbox unavailable during test-0',
    });
    expect(sandbox.disposed).toBe(1);
  });

  it('uses the approved compile timeout and treats a compile timeout as TIME_LIMIT_EXCEEDED', async () => {
    const { sandbox, result } = judgeWith(
      () => Promise.resolve(outcome({ exitCode: -1, timedOut: true })),
      { ...request, language: 'cpp', timeLimitMs: 5000 },
    );
    await expect(result).resolves.toMatchObject({ status: 'TIME_LIMIT_EXCEEDED' });
    expect(sandbox.executions[0]).toMatchObject({ stage: 'compile', timeoutMs: 15_000 });
  });

  it('disposes the workspace after a successful run', async () => {
    const { sandbox, result } = judgeWith(() => Promise.resolve(outcome()));
    await expect(result).resolves.toMatchObject({ status: 'ACCEPTED', score: 10 });
    expect(sandbox.disposed).toBe(1);
  });
});

describe('JudgeEngine runner trust boundary (JDG-002)', () => {
  it('never creates a workspace or container for an unapproved language', async () => {
    const { sandbox, result } = judgeWith(() => Promise.resolve(outcome()), {
      ...request,
      language: 'ruby; docker run evil' as JudgeRequest['language'],
    });
    await expect(result).resolves.toMatchObject({
      status: 'INTERNAL_ERROR',
      stderr: 'Unsupported language',
    });
    expect(sandbox.workspaces).toHaveLength(0);
    expect(sandbox.executions).toHaveLength(0);
  });

  it('keeps filename, image and argv fixed whatever the source and stdin contain', async () => {
    const hostile = '"; rm -rf / #$(id) `id` -o /etc/passwd ../../x\n--image=evil';
    const { sandbox, result } = judgeWith(() => Promise.resolve(outcome()), {
      ...request,
      language: 'cpp',
      sourceCode: hostile,
      testCases: [{ stdin: hostile, expectedOutput: '1' }],
    });
    await result;
    expect(sandbox.workspaces).toEqual([[{ name: 'main.cpp', content: hostile }]]);
    expect(sandbox.executions.map(({ image, command }) => ({ image, command }))).toEqual([
      {
        image: 'bkpractice-judge-cpp:latest',
        command: ['g++', '-std=c++20', '-O2', '-pipe', 'main.cpp', '-o', 'main'],
      },
      { image: 'bkpractice-judge-cpp:latest', command: ['./main'] },
    ]);
    expect(sandbox.executions[0]?.stdin).toBe('');
  });

  it('runs the Python syntax check before execution and reports COMPILE_ERROR', async () => {
    const { sandbox, result } = judgeWith(() =>
      Promise.resolve(outcome({ exitCode: 1, stderr: 'SyntaxError: invalid syntax' })),
    );
    await expect(result).resolves.toMatchObject({ status: 'COMPILE_ERROR' });
    expect(sandbox.executions.map((execution) => execution.stage)).toEqual(['compile']);
  });

  it('does not leak an unexpected error message into the result', async () => {
    const { result } = judgeWith(() =>
      Promise.reject(new Error("ENOENT: open '/var/lib/judge/workspaces/exec-1/main.py'")),
    );
    await expect(result).resolves.toMatchObject({
      status: 'INTERNAL_ERROR',
      stderr: 'Judge internal error',
    });
  });
});

describe('JudgeEngine standard evaluation (JDG-001)', () => {
  const three: JudgeRequest = {
    ...request,
    testCases: [
      { stdin: 'a', expectedOutput: '1', score: 30 },
      { stdin: 'b', expectedOutput: '2', score: 30 },
      { stdin: 'c', expectedOutput: '3', score: 40 },
    ],
  };

  it('stops at the first wrong test and reports partial counts and score (AC-011)', async () => {
    const { sandbox, result } = judgeWith(() => Promise.resolve(outcome()), three);
    await expect(result).resolves.toMatchObject({
      status: 'WRONG_ANSWER',
      passedTests: 1,
      totalTests: 3,
      score: 30,
    });
    expect(sandbox.executions.map((execution) => execution.stage)).toEqual([
      'compile',
      'test-0',
      'test-1',
    ]);
  });

  it('reports ACCEPTED with the measured score and never a default (FR-010)', async () => {
    const { result } = judgeWith(() => Promise.resolve(outcome()), {
      ...request,
      testCases: [{ stdin: '1', expectedOutput: '1', score: 0 }],
    });
    await expect(result).resolves.toMatchObject({ status: 'ACCEPTED', score: 0 });
  });

  it('never turns an empty test set into an accepted result (AC-008)', async () => {
    const { sandbox, result } = judgeWith(() => Promise.resolve(outcome()), {
      ...request,
      testCases: [],
    });
    await expect(result).resolves.toMatchObject({ status: 'INTERNAL_ERROR' });
    expect(sandbox.executions).toHaveLength(0);
  });

  it('sums execution time only and sends no memory figure (FR-011, FR-012)', async () => {
    const { result } = judgeWith(
      (stage) => Promise.resolve(outcome({ runtimeMs: stage === 'compile' ? 900 : 7 })),
      { ...three, testCases: three.testCases.map((test) => ({ ...test, expectedOutput: '1' })) },
    );
    const resolved = await result;
    expect(resolved.runtimeMs).toBe(21);
    expect(resolved).not.toHaveProperty('memoryKb');
  });

  it('accepts a Run without expected output and returns its output (D-02, D-04)', async () => {
    const { result } = judgeWith(() => Promise.resolve(outcome({ stdout: 'hi\n', stderr: 'w' })), {
      ...request,
      mode: 'RUN',
      testCases: [{ stdin: 'x' }],
    });
    await expect(result).resolves.toMatchObject({
      mode: 'RUN',
      status: 'ACCEPTED',
      stdout: 'hi\n',
      stderr: 'w',
    });
  });

  it('never echoes hidden test data or source in the result (AC-006)', async () => {
    const { result } = judgeWith(() => Promise.resolve(outcome({ stdout: 'nope' })), {
      ...request,
      sourceCode: 'SOURCE-MARKER',
      testCases: [{ stdin: 'STDIN-MARKER', expectedOutput: 'EXPECTED-MARKER', score: 1 }],
    });
    const serialized = JSON.stringify(await result);
    for (const marker of ['SOURCE-MARKER', 'STDIN-MARKER', 'EXPECTED-MARKER'])
      expect(serialized).not.toContain(marker);
  });

  it('removes the sandbox workspace path from compile diagnostics (FR-015)', async () => {
    const { result } = judgeWith(() =>
      Promise.resolve(
        outcome({ exitCode: 1, stdout: '', stderr: '/workspace/main.py:3:5: error: bad token\n' }),
      ),
    );
    await expect(result).resolves.toMatchObject({
      status: 'COMPILE_ERROR',
      compileOutput: 'main.py:3:5: error: bad token\n',
      error: { line: 3, column: 5, message: 'bad token' },
    });
  });
});
