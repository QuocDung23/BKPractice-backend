import { buildDockerCreateArgs, createContainerName } from './docker-run-args';

describe('buildDockerCreateArgs', () => {
  const args = buildDockerCreateArgs({
    containerName: 'bkpractice-x',
    dockerWorkspace: '/ws/x',
    image: 'bkpractice-judge-c:latest',
    command: ['./main'],
    memoryLimitMb: 256,
  });
  const joined = args.join(' ');

  it('applies every approved isolation control (JDG-005 D-11)', () => {
    expect(args[0]).toBe('create');
    expect(joined).toContain('--network none');
    expect(joined).toContain('--cpus 1');
    expect(joined).toContain('--memory 256m --memory-swap 256m');
    expect(joined).toContain('--pids-limit 64');
    expect(joined).toContain('--user 1000:1000');
    expect(joined).toContain('--cap-drop ALL');
    expect(joined).toContain('--security-opt no-new-privileges');
    expect(args).toContain('--read-only');
    expect(joined).toContain('--tmpfs /tmp:rw,noexec,nosuid,size=64m');
    expect(joined).toContain('--volume /ws/x:/workspace:rw');
  });

  it('keeps stdin open and never auto-removes so OOM state can be inspected', () => {
    expect(args).toContain('--interactive');
    expect(args).not.toContain('--rm');
    expect(args).not.toContain('--privileged');
  });

  it('puts image and trusted command last', () => {
    expect(args.slice(-2)).toEqual(['bkpractice-judge-c:latest', './main']);
  });
});

describe('createContainerName', () => {
  it('strips unsafe characters from payload ids', () => {
    expect(createContainerName('a/b;rm -rf', 'test-0')).toMatch(
      /^bkpractice-abrm-rf-test-0-[0-9a-f-]{36}$/,
    );
  });

  it('is unique even for identical ids', () => {
    expect(createContainerName('same', 'compile')).not.toBe(createContainerName('same', 'compile'));
  });
});
