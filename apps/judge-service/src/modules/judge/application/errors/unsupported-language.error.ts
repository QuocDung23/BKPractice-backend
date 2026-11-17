/**
 * Raised when a request names a language outside the approved catalog (JDG-002-FR-004). The
 * message never echoes the requested value, which is untrusted input.
 */
export class UnsupportedLanguageError extends Error {
  constructor() {
    super('Unsupported language');
    this.name = 'UnsupportedLanguageError';
  }
}
