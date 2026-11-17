import type { JudgeRequest, JudgeResult, JudgeStatus } from '@app/contracts';
import { normalizeJudgeOutput } from '@app/shared';
import { Inject, Injectable } from '@nestjs/common';

import { HarnessFailureError } from './application/errors/harness-failure.error';
import { SandboxUnavailableError } from './application/errors/sandbox-unavailable.error';
import { UnsupportedLanguageError } from './application/errors/unsupported-language.error';
import {
  findCrashLine,
  findFirstDiagnosticLine,
  keepLearnerDiagnostics,
  keepLearnerFrames,
} from './application/harness-diagnostics';
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
      // JDG-001-AC-008: an empty test set is never evidence of a correct solution.
      if (request.testCases.length === 0) throw new Error('Empty test set');
      // JDG-003-FR-013: one source file, harness after the learner's code. Lines up to
      // `learnerLines` are the learner region; a harness is used only by FUNCTION/OOP.
      const harness = request.problemType === 'STANDARD' ? undefined : request.hiddenHarness;
      const learnerLines = harness ? request.sourceCode.split('\n').length : undefined;
      const source = harness ? `${request.sourceCode}\n\n${harness}` : request.sourceCode;
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
          // JDG-001-FR-015: diagnostics must not carry the sandbox workspace path.
          const raw = `${compilation.stdout}${compilation.stderr}`.replaceAll('/workspace/', '');
          if (learnerLines !== undefined && !compilation.timedOut) {
            // JDG-003-FR-007: a compile error located in the harness is a configuration failure.
            if ((findFirstDiagnosticLine(raw) ?? 0) > learnerLines) throw new HarnessFailureError();
          }
          const output =
            learnerLines === undefined ? raw : keepLearnerDiagnostics(raw, learnerLines);
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
        // JDG-003-FR-004: harness frames and their echoed source never reach the result.
        lastStderr =
          learnerLines === undefined
            ? execution.stderr
            : keepLearnerFrames(execution.stderr, learnerLines);
        const errorStatus = this.executionErrorStatus(execution);
        // JDG-003-FR-008: a crash diagnosed inside the harness is not the learner's fault.
        if (
          errorStatus === 'RUNTIME_ERROR' &&
          learnerLines !== undefined &&
          (findCrashLine(execution.stderr) ?? 0) > learnerLines
        )
          throw new HarnessFailureError();
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
        score,
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
        // Only errors with fixed, host-free messages may reach the result (JDG-002-FR-011).
        stderr:
          error instanceof SandboxUnavailableError ||
          error instanceof UnsupportedLanguageError ||
          error instanceof HarnessFailureError
            ? error.message
            : 'Judge internal error',
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
