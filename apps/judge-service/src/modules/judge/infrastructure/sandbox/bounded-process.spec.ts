import { runBoundedProcess } from './bounded-process';

const node = process.execPath;

describe('runBoundedProcess', () => {
  it('passes stdin and returns exit code with captured output', async () => {
    const result = await runBoundedProcess(
      node,
      ['-e', 'process.stdin.pipe(process.stdout); process.stdin.on("end", () => process.exit(3))'],
      { stdin: 'hello' },
    );

    expect(result).toMatchObject({
      exitCode: 3,
      stdout: 'hello',
      timedOut: false,
      outputLimitExceeded: false,
    });
  });

  it('kills the process and flags timeout', async () => {
    const result = await runBoundedProcess(node, ['-e', 'setInterval(() => {}, 1000)'], {
      timeoutMs: 200,
    });

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).not.toBe(0);
  });

  it('counts stdout and stderr together and keeps at most the byte ceiling', async () => {
    const result = await runBoundedProcess(
      node,
      [
        '-e',
        'process.stderr.write("e".repeat(60)); setInterval(() => process.stdout.write("o".repeat(1000)), 1)',
      ],
      { maxOutputBytes: 100, timeoutMs: 5000 },
    );

    expect(result.outputLimitExceeded).toBe(true);
    expect(result.timedOut).toBe(false);
    expect(Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr)).toBeLessThanOrEqual(
      100,
    );
  });

  it('rejects when the binary cannot be spawned', async () => {
    await expect(runBoundedProcess('bkpractice-missing-binary', [])).rejects.toThrow();
  });
});
