import { Module } from '@nestjs/common';

import { SANDBOX_PORT } from './application/ports/out/sandbox.port';
import {
  JUDGE_PIPELINE,
  ProcessJudgeRequestUseCase,
} from './application/process-judge-request.use-case';
import type { JudgePipeline } from './application/process-judge-request.use-case';
import { runBoundedProcess } from './infrastructure/sandbox/bounded-process';
import {
  BOUNDED_PROCESS_RUNNER,
  DockerSandboxAdapter,
} from './infrastructure/sandbox/docker-sandbox.adapter';
import { JudgeConsumer } from './judge.consumer';
import { JudgeEngine } from './judge.engine';
import { CRunner } from './runners/c.runner';
import { CppRunner } from './runners/cpp.runner';
import { JavaRunner } from './runners/java.runner';
import { PythonRunner } from './runners/python.runner';
import { RunnerRegistry } from './runners/runner.registry';

@Module({
  providers: [
    CRunner,
    CppRunner,
    JavaRunner,
    PythonRunner,
    RunnerRegistry,
    { provide: BOUNDED_PROCESS_RUNNER, useValue: runBoundedProcess },
    DockerSandboxAdapter,
    { provide: SANDBOX_PORT, useExisting: DockerSandboxAdapter },
    JudgeEngine,
    { provide: JUDGE_PIPELINE, useExisting: JudgeEngine },
    {
      provide: ProcessJudgeRequestUseCase,
      inject: [JUDGE_PIPELINE],
      useFactory: (pipeline: JudgePipeline) => new ProcessJudgeRequestUseCase(pipeline),
    },
    JudgeConsumer,
  ],
})
export class JudgeModule {}
