import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SandboxUnavailableError } from '@judge/modules/judge/application/errors/sandbox-unavailable.error';
import type { SandboxExecution } from '@judge/modules/judge/application/ports/out/sandbox.port';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { BoundedProcessResult, BoundedProcessRunner } from './bounded-process';
import { assertWorkerUid, DockerSandboxAdapter } from './docker-sandbox.adapter';

const ok = (overrides: Partial<BoundedProcessResult> = {}): BoundedProcessResult => ({
  exitCode: 0,
  stdout: '',
  stderr: '',
  runtimeMs: 5,
  timedOut: false,
  outputLimitExceeded: false,
  ...overrides,
});

const execution: SandboxExecution = {
  stage: 'test-0',
  image: 'bkpractice-judge-c:latest',
  command: ['./main'],
  stdin: 'in',
  timeoutMs: 1000,
  memoryLimitMb: 128,
};

type Responses = Partial<Record<string, BoundedProcessResult | Error>>;

describe('DockerSandboxAdapter', () => {
  let root: string;
  let calls: string[][];

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'judge-adapter-'));
    calls = [];
  });
  afterEach(() => rm(root, { recursive: true, force: true }));

  const createAdapter = (responses: Responses = {}): DockerSandboxAdapter => {
    const runner: BoundedProcessRunner = (_binary, args) => {
      calls.push([...args]);
      const response = responses[args[0] ?? ''];
      if (response instanceof Error) return Promise.reject(response);
      if (response) return Promise.resolve(response);
      if (args[0] === 'inspect') {
        return Promise.resolve(ok({ stdout: '{"ExitCode":0,"OOMKilled":false,"Error":""}' }));
      }
      return Promise.resolve(ok());
    };
    const config = new ConfigService({
      JUDGE_WORKSPACE_ROOT: root,
      JUDGE_DOCKER_BINARY: 'docker',
      JUDGE_MAX_OUTPUT_BYTES: 1024,
    });
    return new DockerSandboxAdapter(config, runner);
  };
  const commands = (): string[] => calls.map((args) => args[0] ?? '');

  describe('workspace', () => {
    it('writes trusted files owner-only and removes them on dispose', async () => {
      const adapter = createAdapter();
      const workspace = await adapter.createWorkspace('exec-1', [
        { name: 'main.c', content: 'int main(){}' },
      ]);
      const [dir] = await readdir(root);
      const path = join(root, dir ?? '');

      await expect(readFile(join(path, 'main.c'), 'utf8')).resolves.toBe('int main(){}');
      if (process.platform !== 'win32') {
        expect((await stat(path)).mode & 0o777).toBe(0o700);
        expect((await stat(join(path, 'main.c'))).mode & 0o777).toBe(0o600);
      }

      await adapter.disposeWorkspace(workspace);
      await expect(readdir(root)).resolves.toEqual([]);
    });

    it.each(['../escape.c', 'a/b.c', '.hidden', ''])(
      'rejects unsafe file name %p and leaves nothing behind',
      async (name) => {
        const adapter = createAdapter();
        await expect(adapter.createWorkspace('exec-1', [{ name, content: 'x' }])).rejects.toThrow(
          SandboxUnavailableError,
        );
        await expect(readdir(root)).resolves.toEqual([]);
      },
    );
  });

  describe('execute', () => {
    it('runs create, start, inspect and always removes the container', async () => {
      const adapter = createAdapter({ start: ok({ stdout: 'out', runtimeMs: 12 }) });
      const workspace = await adapter.createWorkspace('exec-1', []);

      const outcome = await adapter.execute(workspace, execution);

      expect(commands()).toEqual(['create', 'start', 'inspect', 'rm']);
      expect(outcome).toEqual({
        exitCode: 0,
        stdout: 'out',
        stderr: '',
        runtimeMs: 12,
        timedOut: false,
        outputLimitExceeded: false,
        oomKilled: false,
      });
      const name = calls[0]?.[calls[0].indexOf('--name') + 1];
      expect(calls[1]).toEqual(['start', '--attach', '--interactive', name]);
      expect(calls[3]).toEqual(['rm', '--force', name]);
    });

    it('reports OOM only from runtime state (JDG-005-SR-022)', async () => {
      const adapter = createAdapter({
        inspect: ok({ stdout: '{"ExitCode":137,"OOMKilled":true,"Error":""}' }),
      });
      const workspace = await adapter.createWorkspace('exec-1', []);

      await expect(adapter.execute(workspace, execution)).resolves.toMatchObject({
        exitCode: 137,
        oomKilled: true,
      });
    });

    it('does not treat a bare exit 137 as OOM (JDG-005-AC-015)', async () => {
      const adapter = createAdapter({
        inspect: ok({ stdout: '{"ExitCode":137,"OOMKilled":false,"Error":""}' }),
      });
      const workspace = await adapter.createWorkspace('exec-1', []);

      await expect(adapter.execute(workspace, execution)).resolves.toMatchObject({
        exitCode: 137,
        oomKilled: false,
      });
    });

    it('kills the container on timeout before inspecting', async () => {
      const adapter = createAdapter({ start: ok({ exitCode: -1, timedOut: true }) });
      const workspace = await adapter.createWorkspace('exec-1', []);

      await expect(adapter.execute(workspace, execution)).resolves.toMatchObject({
        timedOut: true,
      });
      expect(commands()).toEqual(['create', 'start', 'kill', 'inspect', 'rm']);
    });

    it('kills the container when output exceeds the ceiling', async () => {
      const adapter = createAdapter({ start: ok({ exitCode: -1, outputLimitExceeded: true }) });
      const workspace = await adapter.createWorkspace('exec-1', []);

      await expect(adapter.execute(workspace, execution)).resolves.toMatchObject({
        outputLimitExceeded: true,
      });
      expect(commands()).toContain('kill');
    });

    it('maps a failed create (daemon/image) to SandboxUnavailableError (JDG-005-AC-007)', async () => {
      const adapter = createAdapter({ create: ok({ exitCode: 125, stderr: 'no such image' }) });
      const workspace = await adapter.createWorkspace('exec-1', []);

      await expect(adapter.execute(workspace, execution)).rejects.toThrow(SandboxUnavailableError);
      expect(commands()).toEqual(['create', 'rm']);
    });

    it('maps a container start error to SandboxUnavailableError and still removes it', async () => {
      const adapter = createAdapter({
        start: ok({ exitCode: 127 }),
        inspect: ok({ stdout: '{"ExitCode":127,"OOMKilled":false,"Error":"exec failed"}' }),
      });
      const workspace = await adapter.createWorkspace('exec-1', []);

      await expect(adapter.execute(workspace, execution)).rejects.toThrow(SandboxUnavailableError);
      expect(commands()).toEqual(['create', 'start', 'inspect', 'rm']);
    });

    it('maps a missing docker binary to SandboxUnavailableError', async () => {
      const adapter = createAdapter({ create: new Error('ENOENT') });
      const workspace = await adapter.createWorkspace('exec-1', []);

      await expect(adapter.execute(workspace, execution)).rejects.toThrow(SandboxUnavailableError);
    });

    it('returns the outcome even when container cleanup fails', async () => {
      const adapter = createAdapter({ rm: new Error('daemon gone') });
      const workspace = await adapter.createWorkspace('exec-1', []);

      await expect(adapter.execute(workspace, execution)).resolves.toMatchObject({ exitCode: 0 });
    });

    it('never passes stdin or source through docker argv', async () => {
      const adapter = createAdapter();
      const workspace = await adapter.createWorkspace('exec-1', [
        { name: 'main.c', content: 'SECRET_SOURCE' },
      ]);

      await adapter.execute(workspace, { ...execution, stdin: 'SECRET_STDIN' });

      expect(calls.flat().join(' ')).not.toMatch(/SECRET_/);
    });
  });
});

describe('assertWorkerUid', () => {
  it('requires the sandbox UID on Linux only', () => {
    expect(() => assertWorkerUid('linux', 0)).toThrow(/UID 1000/);
    expect(() => assertWorkerUid('linux', 1000)).not.toThrow();
    expect(() => assertWorkerUid('win32', undefined)).not.toThrow();
    expect(() => assertWorkerUid('darwin', 501)).not.toThrow();
  });
});
