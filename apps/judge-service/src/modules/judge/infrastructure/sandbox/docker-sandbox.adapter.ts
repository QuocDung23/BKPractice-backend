import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

import { SandboxUnavailableError } from '@judge/modules/judge/application/errors/sandbox-unavailable.error';
import type {
  SandboxExecution,
  SandboxFile,
  SandboxOutcome,
  SandboxPort,
  SandboxWorkspace,
} from '@judge/modules/judge/application/ports/out/sandbox.port';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { BoundedProcessRunner } from './bounded-process';
import { buildDockerCreateArgs, createContainerName, SANDBOX_UID } from './docker-run-args';

export const BOUNDED_PROCESS_RUNNER = Symbol('BOUNDED_PROCESS_RUNNER');

const SAFE_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

class DockerWorkspace implements SandboxWorkspace {
  constructor(
    readonly executionId: string,
    readonly hostPath: string,
    readonly dockerPath: string,
  ) {}
}

interface ContainerState {
  readonly ExitCode: number;
  readonly OOMKilled: boolean;
  readonly Error?: string;
}

@Injectable()
export class DockerSandboxAdapter implements SandboxPort, OnModuleInit {
  private readonly logger = new Logger(DockerSandboxAdapter.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(BOUNDED_PROCESS_RUNNER) private readonly runProcess: BoundedProcessRunner,
  ) {}

  onModuleInit(): void {
    assertWorkerUid(process.platform, process.getuid?.());
  }

  async createWorkspace(
    executionId: string,
    files: readonly SandboxFile[],
  ): Promise<SandboxWorkspace> {
    const root = resolve(this.config.getOrThrow<string>('JUDGE_WORKSPACE_ROOT'));
    let hostPath: string | undefined;
    try {
      await mkdir(root, { recursive: true, mode: 0o700 });
      hostPath = await mkdtemp(join(root, `${executionId.replace(/[^a-zA-Z0-9_-]/g, '')}-`));
      await chmod(hostPath, 0o700);
      for (const file of files) {
        if (!SAFE_FILE_NAME.test(file.name)) throw new Error('Unsafe workspace file name');
        await writeFile(join(hostPath, file.name), file.content, {
          encoding: 'utf8',
          mode: 0o600,
          flag: 'wx',
        });
      }
    } catch (error: unknown) {
      if (hostPath) await this.removeWorkspace(executionId, hostPath);
      this.logger.error(`Workspace setup failed executionId=${executionId}`, describe(error));
      throw new SandboxUnavailableError('workspace');
    }
    const dockerRoot = this.config.get<string>('JUDGE_DOCKER_WORKSPACE_ROOT');
    const dockerPath = dockerRoot ? join(dockerRoot, basename(hostPath)) : hostPath;
    return new DockerWorkspace(executionId, hostPath, dockerPath);
  }

  async execute(workspace: SandboxWorkspace, execution: SandboxExecution): Promise<SandboxOutcome> {
    if (!(workspace instanceof DockerWorkspace)) throw new SandboxUnavailableError(execution.stage);
    const binary = this.config.getOrThrow<string>('JUDGE_DOCKER_BINARY');
    const maxOutputBytes = this.config.getOrThrow<number>('JUDGE_MAX_OUTPUT_BYTES');
    const containerName = createContainerName(workspace.executionId, execution.stage);
    const context = `executionId=${workspace.executionId} stage=${execution.stage}`;

    const created = await this.runDocker(binary, context, [
      ...buildDockerCreateArgs({
        containerName,
        dockerWorkspace: workspace.dockerPath,
        image: execution.image,
        command: execution.command,
        memoryLimitMb: execution.memoryLimitMb,
      }),
    ]);
    if (created.exitCode !== 0) {
      this.logger.error(`Container create failed ${context}`, created.stderr.slice(0, 500));
      await this.removeContainer(binary, containerName, context);
      throw new SandboxUnavailableError(execution.stage);
    }

    try {
      const run = await this.runDocker(
        binary,
        context,
        ['start', '--attach', '--interactive', containerName],
        {
          stdin: execution.stdin,
          timeoutMs: execution.timeoutMs,
          maxOutputBytes,
        },
      );
      if (run.timedOut || run.outputLimitExceeded) {
        await this.runDocker(binary, context, ['kill', containerName]).catch(() => undefined);
      }
      const state = await this.inspectState(binary, containerName, context);
      if (state.Error && !run.timedOut && !run.outputLimitExceeded) {
        this.logger.error(`Container start failed ${context}`, state.Error.slice(0, 500));
        throw new SandboxUnavailableError(execution.stage);
      }
      return {
        exitCode: state.ExitCode,
        stdout: run.stdout,
        stderr: run.stderr,
        runtimeMs: run.runtimeMs,
        timedOut: run.timedOut,
        outputLimitExceeded: run.outputLimitExceeded,
        oomKilled: state.OOMKilled === true,
      };
    } finally {
      await this.removeContainer(binary, containerName, context);
    }
  }

  async disposeWorkspace(workspace: SandboxWorkspace): Promise<void> {
    if (workspace instanceof DockerWorkspace) {
      await this.removeWorkspace(workspace.executionId, workspace.hostPath);
    }
  }

  private async runDocker(
    binary: string,
    context: string,
    args: readonly string[],
    options?: Parameters<BoundedProcessRunner>[2],
  ): ReturnType<BoundedProcessRunner> {
    try {
      return await this.runProcess(binary, args, options);
    } catch (error: unknown) {
      this.logger.error(`Docker binary failed ${context}`, describe(error));
      throw new SandboxUnavailableError(args[0] ?? 'docker');
    }
  }

  private async inspectState(
    binary: string,
    containerName: string,
    context: string,
  ): Promise<ContainerState> {
    const inspected = await this.runDocker(binary, context, [
      'inspect',
      '--format',
      '{{json .State}}',
      containerName,
    ]);
    if (inspected.exitCode === 0) {
      try {
        return JSON.parse(inspected.stdout) as ContainerState;
      } catch {
        // fall through to the infrastructure error below
      }
    }
    this.logger.error(`Container inspect failed ${context}`, inspected.stderr.slice(0, 500));
    throw new SandboxUnavailableError('inspect');
  }

  private async removeContainer(
    binary: string,
    containerName: string,
    context: string,
  ): Promise<void> {
    try {
      const removed = await this.runProcess(binary, ['rm', '--force', containerName]);
      if (removed.exitCode !== 0 && !/no such container/i.test(removed.stderr)) {
        this.logger.warn(`Container cleanup failed ${context}`);
      }
    } catch (error: unknown) {
      this.logger.warn(`Container cleanup failed ${context}`, describe(error));
    }
  }

  private async removeWorkspace(executionId: string, hostPath: string): Promise<void> {
    try {
      await rm(hostPath, { recursive: true, force: true });
    } catch (error: unknown) {
      this.logger.warn(`Workspace cleanup failed executionId=${executionId}`, describe(error));
    }
  }
}

/** JDG-005-SR-016: workspaces are 0700/0600, so on Linux the worker must share the sandbox UID. */
export function assertWorkerUid(platform: NodeJS.Platform, uid: number | undefined): void {
  if (platform === 'linux' && uid !== SANDBOX_UID) {
    throw new Error(`Judge worker must run as UID ${SANDBOX_UID} on Linux (current: ${uid})`);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}
