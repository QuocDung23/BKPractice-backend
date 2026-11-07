import type { JudgeRequest, JudgeResult, JudgeStatus } from '@app/contracts';
import { normalizeJudgeOutput } from '@app/shared';
import { Inject, Injectable } from '@nestjs/common';

import { SANDBOX_PORT } from './application/ports/out/sandbox.port';
import type {
  SandboxOutcome,
  SandboxPort,
  SandboxWorkspace,
} from './application/ports/out/sandbox.port';
import { parseCompilerError } from './compiler-error.parser';
import { RunnerRegistry } from './runners/runner.registry';

@Injectable()
export class JudgeEngine {
  constructor(
    private readonly runners: RunnerRegistry,
    @Inject(SANDBOX_PORT) private readonly sandbox: SandboxPort,
  ) {}

  async judge(request: JudgeRequest): Promise<JudgeResult> {
    let workspace: SandboxWorkspace | undefined;
    try {
      const runner = this.runners.get(request.language);
      const source = request.hiddenHarness
        ? `${request.sourceCode}\n\n${request.hiddenHarness}`
        : request.sourceCode;
      workspace = await this.sandbox.createWorkspace(request.executionId, [
        { name: runner.sourceFile, content: source },
      ]);

      if (runner.compileCommand) {
        const compilation = await this.sandbox.execute(workspace, {
          stage: 'compile',
          image: runner.image,
          command: runner.compileCommand,
          stdin: '',
          timeoutMs: Math.max(request.timeLimitMs * 3, 10_000),
          memoryLimitMb: request.memoryLimitMb,
        });
        if (compilation.exitCode !== 0 || compilation.timedOut) {
          const output = `${compilation.stdout}${compilation.stderr}`;
          return {
            executionId: request.executionId,
            submissionId: request.submissionId,
            mode: request.mode,
            status: compilation.timedOut ? 'TIME_LIMIT_EXCEEDED' : 'COMPILE_ERROR',
            compileOutput: output,
            error: parseCompilerError(output),
          };
        }
      }

      let passedTests = 0;
      let score = 0;
      let totalRuntimeMs = 0;
      let lastStdout = '';
      let lastStderr = '';
      for (const testCase of request.testCases) {
        const execution = await this.sandbox.execute(workspace, {
          stage: `test-${passedTests}`,
          image: runner.image,
          command: runner.executeCommand,
          stdin: testCase.stdin,
          timeoutMs: request.timeLimitMs,
          memoryLimitMb: request.memoryLimitMb,
        });
        totalRuntimeMs += execution.runtimeMs;
        lastStdout = execution.stdout;
        lastStderr = execution.stderr;
        const errorStatus = this.executionErrorStatus(execution);
        if (errorStatus) {
          return this.result(
            request,
            errorStatus,
            passedTests,
            score,
            totalRuntimeMs,
            lastStdout,
            lastStderr,
          );
        }
        if (
          testCase.expectedOutput !== undefined &&
          normalizeJudgeOutput(execution.stdout) !== normalizeJudgeOutput(testCase.expectedOutput)
        ) {
          return this.result(
            request,
            'WRONG_ANSWER',
            passedTests,
            score,
            totalRuntimeMs,
            lastStdout,
            lastStderr,
          );
        }
        passedTests += 1;
        score += testCase.score ?? 0;
      }
      return this.result(
        request,
        'ACCEPTED',
        passedTests,
        score || 100,
        totalRuntimeMs,
        lastStdout,
        lastStderr,
      );
    } catch (error: unknown) {
      return {
        executionId: request.executionId,
        submissionId: request.submissionId,
        mode: request.mode,
        status: 'INTERNAL_ERROR',
        stderr: error instanceof Error ? error.message : 'Unknown judge error',
      };
    } finally {
      if (workspace) await this.sandbox.disposeWorkspace(workspace);
    }
  }

  private executionErrorStatus(result: SandboxOutcome): JudgeStatus | undefined {
    if (result.timedOut) return 'TIME_LIMIT_EXCEEDED';
    if (result.outputLimitExceeded) return 'RUNTIME_ERROR';
    // JDG-005-SR-022: only a runtime-reported OOM kill counts; a bare exit 137 does not.
    if (result.oomKilled) return 'MEMORY_LIMIT_EXCEEDED';
    if (result.exitCode !== 0) return 'RUNTIME_ERROR';
    return undefined;
  }

  private result(
    request: JudgeRequest,
    status: JudgeStatus,
    passedTests: number,
    score: number,
    runtimeMs: number,
    stdout: string,
    stderr: string,
  ): JudgeResult {
    return {
      executionId: request.executionId,
      submissionId: request.submissionId,
      mode: request.mode,
      status,
      passedTests,
      totalTests: request.testCases.length,
      score,
      runtimeMs,
      stdout,
      stderr,
    };
  }
}
