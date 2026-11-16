import { Workbook } from 'exceljs';

import { ImportAccounts } from '@/modules/auth/application';
import type { AccountImportRepository, PasswordHasher } from '@/modules/auth/application/ports';
import { AccountImportFailure, validateAccountImport } from '@/modules/auth/domain';
import { XlsxAccountParser } from '@/modules/auth/infrastructure/account-import';
import { RoleName } from '@/modules/rbac/domain';

async function makeFile(
  rows: unknown[][],
  headers = ['mssv', 'name', 'email', 'role'],
): Promise<Buffer> {
  const book = new Workbook();
  const sheet = book.addWorksheet('Accounts');
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await book.xlsx.writeBuffer());
}

describe('Account Excel import boundaries', () => {
  const parser = new XlsxAccountParser();
  const admin = { userId: 'admin', roles: [RoleName.Admin], permissions: ['user:import'] };
  const student = ['00123', ' Nguyễn An ', ' STUDENT@SV1.DUT.UDN.VN ', 'STUDENT'];
  const lecturer = [null, 'Lecturer', 'lecturer@dut.udn.vn', 'LECTURER'];

  it('reads actual .xlsx data, preserves leading zeros and normalizes name/email', async () => {
    const rows = validateAccountImport(await parser.parse(await makeFile([student, [], lecturer])));
    expect(rows).toEqual([
      {
        row: 2,
        studentId: '00123',
        displayName: 'Nguyễn An',
        email: 'student@sv1.dut.udn.vn',
        role: 'STUDENT',
      },
      {
        row: 4,
        studentId: null,
        displayName: 'Lecturer',
        email: 'lecturer@dut.udn.vn',
        role: 'LECTURER',
      },
    ]);
  });

  it('imports the visible email text from Excel hyperlink cells', async () => {
    const book = new Workbook();
    const sheet = book.addWorksheet('Accounts');
    sheet.addRow(['mssv', 'name', 'email', 'role']);
    sheet.addRow(['00123', 'Student', null, 'STUDENT']);
    sheet.getCell('C2').value = {
      text: 'student@sv1.dut.udn.vn',
      hyperlink: 'https://other.example/path',
    };
    const rows = validateAccountImport(
      await parser.parse(Buffer.from(await book.xlsx.writeBuffer())),
    );
    expect(rows).toMatchObject([{ email: 'student@sv1.dut.udn.vn', role: 'STUDENT' }]);
  });

  it('requires the school email domain for each imported role', async () => {
    const rows = await parser.parse(
      await makeFile([
        ['1', 'Student', 'student@dut.udn.vn', 'STUDENT'],
        [null, 'Lecturer', 'lecturer@sv1.dut.udn.vn', 'LECTURER'],
        ['2', 'Student', 'student@other.edu.vn', 'STUDENT'],
        ['3', 'Student', 'sv1.dut.udn.vn', 'STUDENT'],
      ]),
    );
    try {
      validateAccountImport(rows);
      throw new Error('Expected invalid email domains');
    } catch (error) {
      expect(error).toBeInstanceOf(AccountImportFailure);
      if (!(error instanceof AccountImportFailure)) throw error;
      expect(error.issues).toEqual([
        { row: 2, field: 'email', code: 'invalid_email' },
        { row: 3, field: 'email', code: 'invalid_email' },
        { row: 4, field: 'email', code: 'invalid_email' },
        { row: 5, field: 'email', code: 'invalid_email' },
      ]);
    }
  });

  it('reports duplicate and invalid rows without returning cell data', async () => {
    const file = await makeFile([
      student,
      student,
      ['', 'Name', 'valid@sv1.dut.udn.vn', 'STUDENT'],
      ['99', 'Name', 'other@dut.udn.vn', 'LECTURER'],
      ['', 'Name', 'admin@dut.udn.vn', 'ADMIN'],
    ]);
    try {
      validateAccountImport(await parser.parse(file));
      throw new Error('Expected validation failure');
    } catch (error) {
      expect(error).toBeInstanceOf(AccountImportFailure);
      if (!(error instanceof AccountImportFailure)) throw error;
      expect(error).toMatchObject({ code: 'invalid_rows', totalRows: 5 });
      expect(error.issues).toEqual(
        expect.arrayContaining([
          { row: 2, field: 'mssv', code: 'duplicate_in_file' },
          { row: 4, field: 'mssv', code: 'invalid_student_id' },
          { row: 5, field: 'mssv', code: 'lecturer_student_id_must_be_empty' },
          { row: 6, field: 'role', code: 'invalid_role' },
        ]),
      );
      expect(JSON.stringify(error)).not.toContain('@sv1.dut.udn.vn');
    }
  });

  it('rejects formulas, arbitrary files, wrong headers, extra sheets and oversized row counts', async () => {
    const formula = await parser.parse(
      await makeFile([['1', { formula: '1+1', result: 'Name' }, 'a@sv1.dut.udn.vn', 'STUDENT']]),
    );
    expect(() => validateAccountImport(formula)).toThrow('invalid_rows');
    await expect(parser.parse(Buffer.from('not an Excel file'))).rejects.toThrow('invalid_file');
    await expect(
      parser.parse(await makeFile([student], ['mssv', 'name', 'email', 'roles'])),
    ).rejects.toThrow('invalid_file');
    const book = new Workbook();
    book.addWorksheet('One').addRow(['mssv', 'name', 'email', 'role']);
    book.addWorksheet('Two');
    await expect(parser.parse(Buffer.from(await book.xlsx.writeBuffer()))).rejects.toThrow(
      'invalid_file',
    );
    await expect(
      parser.parse(await makeFile(Array.from({ length: 1001 }, () => student))),
    ).rejects.toThrow('invalid_file');
  });

  it('rejects excessive declared ZIP expansion before loading the workbook', async () => {
    const buffer = await makeFile([student]);
    const central = buffer.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    expect(central).toBeGreaterThan(0);
    buffer.writeUInt32LE(26 * 1024 * 1024, central + 24);
    await expect(parser.parse(buffer)).rejects.toMatchObject({
      code: 'invalid_file',
      issues: [{ row: 0, field: 'row', code: 'archive_limit_exceeded' }],
    });
  });

  it.each(['first-test-password', 'second-test-password'])(
    'hashes each imported account with the configured password (%s)',
    async (importPassword) => {
      const repository: AccountImportRepository = {
        findConflicts: jest.fn().mockResolvedValue([]),
        createAll: jest.fn().mockResolvedValue(undefined),
      };
      const passwords: PasswordHasher = {
        hash: jest
          .fn()
          .mockResolvedValueOnce('student-hash')
          .mockResolvedValueOnce('lecturer-hash'),
        verify: jest.fn(),
        verifyDummy: jest.fn(),
      };
      const imports = new ImportAccounts(parser, repository, passwords, importPassword);
      await expect(imports.execute(admin, await makeFile([student, lecturer]))).resolves.toEqual({
        totalRows: 2,
        created: 2,
      });
      expect(passwords.hash).toHaveBeenCalledTimes(2);
      expect(passwords.hash).toHaveBeenNthCalledWith(1, importPassword);
      expect(passwords.hash).toHaveBeenNthCalledWith(2, importPassword);
      expect(repository.createAll).toHaveBeenCalledWith(
        [
          expect.objectContaining({ passwordHash: 'student-hash' }),
          expect.objectContaining({ passwordHash: 'lecturer-hash' }),
        ],
        admin.userId,
      );
    },
  );

  it('checks authorization and all rows before hashing or writing any account', async () => {
    const repository: AccountImportRepository = {
      findConflicts: jest.fn().mockResolvedValue([]),
      createAll: jest.fn(),
    };
    const passwords: PasswordHasher = {
      hash: jest.fn(),
      verify: jest.fn(),
      verifyDummy: jest.fn(),
    };
    const imports = new ImportAccounts(parser, repository, passwords, 'test-import-password');
    await expect(
      imports.execute({ ...admin, permissions: [] }, Buffer.from('invalid')),
    ).rejects.toThrow('forbidden');
    await expect(imports.execute(admin, await makeFile([student, student]))).rejects.toThrow(
      'invalid_rows',
    );
    expect(repository.findConflicts).not.toHaveBeenCalled();
    expect(passwords.hash).not.toHaveBeenCalled();
    expect(repository.createAll).not.toHaveBeenCalled();
  });
});
