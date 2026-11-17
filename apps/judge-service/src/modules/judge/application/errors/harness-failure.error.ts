/**
 * Raised when a failure is located in the hidden harness rather than in the learner's code
 * (JDG-003-FR-007/FR-008). The message is fixed so no harness detail reaches a result.
 */
export class HarnessFailureError extends Error {
  constructor() {
    super('Harness failure');
    this.name = 'HarnessFailureError';
  }
}
