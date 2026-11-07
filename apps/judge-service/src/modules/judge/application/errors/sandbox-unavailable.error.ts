/**
 * Raised when the sandbox infrastructure (daemon, image, workspace) fails, as opposed to the
 * submitted program failing. The message is generic so no host detail leaks into results.
 */
export class SandboxUnavailableError extends Error {
  constructor(readonly stage: string) {
    super(`Sandbox unavailable during ${stage}`);
    this.name = 'SandboxUnavailableError';
  }
}
