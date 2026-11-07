import { spawn } from 'node:child_process';

export interface BoundedProcessOptions {
  readonly stdin?: string;
  readonly timeoutMs?: number;
  /** Combined stdout+stderr byte ceiling; bytes beyond it are dropped and the process killed. */
  readonly maxOutputBytes?: number;
}

export interface BoundedProcessResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly runtimeMs: number;
  readonly timedOut: boolean;
  readonly outputLimitExceeded: boolean;
}

/** Runs a trusted binary with argv (never a shell). Rejects only when the binary cannot spawn. */
export type BoundedProcessRunner = (
  binary: string,
  args: readonly string[],
  options?: BoundedProcessOptions,
) => Promise<BoundedProcessResult>;

export const runBoundedProcess: BoundedProcessRunner = (binary, args, options = {}) =>
  new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const child = spawn(binary, [...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const maxOutput = options.maxOutputBytes ?? Number.POSITIVE_INFINITY;
    let bytes = 0;
    let timedOut = false;
    let outputLimitExceeded = false;

    const timeout =
      options.timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            child.kill('SIGKILL');
          }, options.timeoutMs);

    const capture =
      (target: Buffer[]) =>
      (chunk: Buffer): void => {
        if (outputLimitExceeded) return;
        const room = maxOutput - bytes;
        bytes += chunk.length;
        if (chunk.length <= room) {
          target.push(chunk);
          return;
        }
        if (room > 0) target.push(chunk.subarray(0, room));
        outputLimitExceeded = true;
        child.kill('SIGKILL');
      };
    child.stdout.on('data', capture(stdout));
    child.stderr.on('data', capture(stderr));
    // The child may exit before consuming stdin; that is not an error of ours.
    child.stdin.on('error', () => undefined);
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      resolve({
        exitCode: code ?? -1,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        runtimeMs: Math.ceil(performance.now() - startedAt),
        timedOut,
        outputLimitExceeded,
      });
    });
    child.stdin.end(options.stdin ?? '');
  });
