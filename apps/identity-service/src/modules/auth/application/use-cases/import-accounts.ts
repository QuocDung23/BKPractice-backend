import type {
  AccountImportParser,
  AccountImportRepository,
  PasswordHasher,
} from '@/modules/auth/application/ports';
import {
  AccountImportFailure,
  requireAccountImport,
  validateAccountImport,
} from '@/modules/auth/domain';
import type { AuthorizationPrincipal } from '@/modules/rbac/domain';

export class ImportAccounts {
  constructor(
    private readonly parser: AccountImportParser,
    private readonly accounts: AccountImportRepository,
    private readonly passwords: PasswordHasher,
    private readonly importPassword: string,
  ) {}

  async execute(
    principal: AuthorizationPrincipal,
    content: Uint8Array,
  ): Promise<{ totalRows: number; created: number }> {
    requireAccountImport(principal);
    const rows = validateAccountImport(await this.parser.parse(content));
    const conflicts = await this.accounts.findConflicts(rows);
    if (conflicts.length) throw new AccountImportFailure('conflict', conflicts, rows.length);
    const prepared = [];
    for (const row of rows) {
      try {
        prepared.push({ ...row, passwordHash: await this.passwords.hash(this.importPassword) });
      } catch {
        throw new AccountImportFailure('dependency_unavailable');
      }
    }
    await this.accounts.createAll(prepared, principal.userId);
    return { totalRows: rows.length, created: rows.length };
  }
}
