export class DuplicateProblemIdError extends Error {
  constructor() {
    super('Generated problem ID is already in use');
    this.name = 'DuplicateProblemIdError';
  }
}
