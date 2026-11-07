import { randomUUID } from 'node:crypto';

/** Container user; the worker must run with the same UID so workspaces need no wider modes. */
export const SANDBOX_UID = 1000;
export const SANDBOX_GID = 1000;

export interface DockerCreateOptions {
  readonly containerName: string;
  readonly dockerWorkspace: string;
  readonly image: string;
  readonly command: readonly string[];
  readonly memoryLimitMb: number;
}

/** Unique per invocation; payload text cannot collide with or target another container. */
export function createContainerName(executionId: string, stage: string): string {
  const safe = `${executionId}-${stage}`.replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 64);
  return `bkpractice-${safe}-${randomUUID()}`;
}

/** Platform ceilings approved in JDG-005 D-11; nothing here comes from the request except memory. */
export function buildDockerCreateArgs(options: DockerCreateOptions): string[] {
  return [
    'create',
    '--interactive',
    '--name',
    options.containerName,
    '--network',
    'none',
    '--cpus',
    '1',
    '--memory',
    `${options.memoryLimitMb}m`,
    '--memory-swap',
    `${options.memoryLimitMb}m`,
    '--pids-limit',
    '64',
    '--user',
    `${SANDBOX_UID}:${SANDBOX_GID}`,
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--read-only',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=64m',
    '--volume',
    `${options.dockerWorkspace}:/workspace:rw`,
    '--workdir',
    '/workspace',
    options.image,
    ...options.command,
  ];
}
