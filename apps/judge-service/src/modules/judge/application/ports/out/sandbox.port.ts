export const SANDBOX_PORT = Symbol('SANDBOX_PORT');

/** A file the core places in the workspace; `name` must be a plain trusted filename. */
export interface SandboxFile {
  readonly name: string;
  readonly content: string;
}

/** Opaque per-request workspace handle; the core never sees host paths. */
export interface SandboxWorkspace {
  readonly executionId: string;
}

export interface SandboxExecution {
  /** Short trusted label such as `compile` or `test-0`; used for logs and container naming. */
  readonly stage: string;
  readonly image: string;
  readonly command: readonly string[];
  readonly stdin: string;
  readonly timeoutMs: number;
  readonly memoryLimitMb: number;
}

/** Technical outcome only; verdict mapping belongs to the judge pipeline (JDG-001). */
export interface SandboxOutcome {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly runtimeMs: number;
  readonly timedOut: boolean;
  readonly outputLimitExceeded: boolean;
  /** True only when the container runtime reported an OOM kill (JDG-005-SR-022). */
  readonly oomKilled: boolean;
}

export interface SandboxPort {
  createWorkspace(executionId: string, files: readonly SandboxFile[]): Promise<SandboxWorkspace>;
  execute(workspace: SandboxWorkspace, execution: SandboxExecution): Promise<SandboxOutcome>;
  /** Best effort; failures are logged by the adapter and never thrown (JDG-005-SR-009). */
  disposeWorkspace(workspace: SandboxWorkspace): Promise<void>;
}
