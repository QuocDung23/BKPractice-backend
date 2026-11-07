import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type {
  SandboxExecution,
  SandboxOutcome,
} from '@judge/modules/judge/application/ports/out/sandbox.port';
import { ConfigService } from '@nestjs/config';

import { runBoundedProcess } from './bounded-process';
import { DockerSandboxAdapter } from './docker-sandbox.adapter';

/**
 * Runs against a real Docker daemon (JDG-005 AC evidence). Opt in with JUDGE_DOCKER_IT=1 after
 * `pnpm judge:images:build`; skipped otherwise so the default test run needs no daemon.
 */
const describeDocker = process.env.JUDGE_DOCKER_IT === '1' ? describe : describe.skip;

const IMAGE = 'bkpractice-judge-python:latest';
const MAX_OUTPUT = 64 * 1024;

describeDocker('DockerSandboxAdapter (real Docker)', () => {
  jest.setTimeout(60_000);
  let root: string;
  let adapter: DockerSandboxAdapter;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'judge-it-'));
    adapter = new DockerSandboxAdapter(
      new ConfigService({
        JUDGE_WORKSPACE_ROOT: root,
        JUDGE_DOCKER_BINARY: 'docker',
        JUDGE_MAX_OUTPUT_BYTES: MAX_OUTPUT,
      }),
      runBoundedProcess,
    );
  });
  afterEach(() => rm(root, { recursive: true, force: true }));

  const runPython = async (
    executionId: string,
    code: string,
    overrides: Partial<SandboxExecution> = {},
  ): Promise<SandboxOutcome> => {
    const workspace = await adapter.createWorkspace(executionId, [
      { name: 'main.py', content: code },
    ]);
    try {
      return await adapter.execute(workspace, {
        stage: 'test-0',
        image: IMAGE,
        command: ['python3', '-I', 'main.py'],
        stdin: '',
        timeoutMs: 5_000,
        memoryLimitMb: 128,
        ...overrides,
      });
    } finally {
      await adapter.disposeWorkspace(workspace);
    }
  };

  const remainingContainers = async (executionId: string): Promise<string> => {
    const listed = await runBoundedProcess('docker', [
      'ps',
      '--all',
      '--quiet',
      '--filter',
      `name=bkpractice-${executionId}`,
    ]);
    return listed.stdout.trim();
  };

  it('echoes stdin and leaves no container or workspace behind (AC-005)', async () => {
    const outcome = await runPython('it-echo', 'print(input()[::-1])', { stdin: 'abc\n' });

    expect(outcome).toMatchObject({ exitCode: 0, stdout: 'cba\n', oomKilled: false });
    await expect(remainingContainers('it-echo')).resolves.toBe('');
    await expect(readdir(root)).resolves.toEqual([]);
  });

  it('has no network access (AC-001)', async () => {
    const outcome = await runPython(
      'it-net',
      'import socket\ntry:\n  socket.create_connection(("1.1.1.1", 53), 2)\n  print("online")\nexcept OSError:\n  print("offline")',
    );
    expect(outcome.stdout.trim()).toBe('offline');
  });

  it('cannot write outside the workspace and runs as UID 1000 (AC-008/010)', async () => {
    const outcome = await runPython(
      'it-fs',
      'import os\nprint(os.getuid())\ntry:\n  open("/etc/x", "w")\n  print("wrote")\nexcept OSError:\n  print("denied")',
    );
    expect(outcome.stdout.split('\n')).toEqual(['1000', 'denied', '']);
  });

  it('kills an infinite loop at the time limit and removes the container (AC-003/011)', async () => {
    const outcome = await runPython('it-loop', 'while True: pass', { timeoutMs: 1_000 });

    expect(outcome.timedOut).toBe(true);
    await expect(remainingContainers('it-loop')).resolves.toBe('');
  });

  it('stops an output flood at the byte ceiling (AC-013)', async () => {
    const outcome = await runPython('it-flood', 'while True: print("x" * 1000)');

    expect(outcome.outputLimitExceeded).toBe(true);
    expect(Buffer.byteLength(outcome.stdout + outcome.stderr)).toBeLessThanOrEqual(MAX_OUTPUT);
  });

  it('reports OOM from container state when memory is exhausted (SR-022)', async () => {
    const outcome = await runPython('it-oom', 'b = bytearray(512 * 1024 * 1024)', {
      memoryLimitMb: 64,
    });
    expect(outcome.oomKilled).toBe(true);
  });

  it('does not report OOM for a voluntary exit 137 (AC-015)', async () => {
    const outcome = await runPython('it-137', 'import os\nos._exit(137)');
    expect(outcome).toMatchObject({ exitCode: 137, oomKilled: false });
  });

  it('isolates concurrent workspaces of different requests (AC-004)', async () => {
    const write = 'open("mine.txt", "w").write("a")\nimport os\nprint(sorted(os.listdir(".")))';
    const [first, second] = await Promise.all([
      runPython('it-par-a', write),
      runPython('it-par-b', write),
    ]);
    expect(first.stdout.trim()).toBe("['main.py', 'mine.txt']");
    expect(second.stdout.trim()).toBe("['main.py', 'mine.txt']");
  });
});
