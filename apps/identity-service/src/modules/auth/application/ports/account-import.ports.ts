import type { AccountImportRow, ImportIssue, RawAccountImportRow } from '@/modules/auth/domain';

export const ACCOUNT_IMPORT_PARSER = Symbol('ACCOUNT_IMPORT_PARSER');
export const ACCOUNT_IMPORT_REPOSITORY = Symbol('ACCOUNT_IMPORT_REPOSITORY');

export interface AccountImportParser {
  parse(content: Uint8Array): Promise<RawAccountImportRow[]>;
}

export interface PreparedImportAccount extends AccountImportRow {
  passwordHash: string;
}

export interface AccountImportRepository {
  findConflicts(rows: AccountImportRow[]): Promise<ImportIssue[]>;
  createAll(rows: PreparedImportAccount[], actorId: string): Promise<void>;
}
