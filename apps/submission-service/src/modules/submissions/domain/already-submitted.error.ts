export class AlreadySubmittedError extends Error {
  constructor(readonly state: 'JUDGING' | 'SOLVED' = 'JUDGING') {
    super('An official submission already exists for this user and problem');
    this.name = 'AlreadySubmittedError';
  }
}
