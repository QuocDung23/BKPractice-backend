import { sendApiError } from '@app/common';
import type { ApiErrorDetail } from '@app/contracts';
import { Catch, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';

import { AccountImportFailure } from '@/modules/auth/domain';
import type { ImportIssue } from '@/modules/auth/domain';

/** Giải thích từng mã lỗi theo dòng của file import; mã lạ được giữ nguyên để không mất thông tin. */
const ISSUE_MESSAGES: Record<string, string> = {
  unexpected_columns: 'file có nhiều hơn 4 cột (MSSV, họ tên, email, vai trò)',
  invalid_name: 'họ tên trống, dài quá 100 ký tự hoặc có ký tự điều khiển',
  invalid_email:
    'email sai định dạng hoặc sai đuôi (sinh viên dùng @sv1.dut.udn.vn, giảng viên dùng @dut.udn.vn)',
  invalid_role: 'vai trò phải là STUDENT hoặc LECTURER',
  invalid_student_id: 'MSSV của sinh viên bị trống, dài quá 64 ký tự hoặc có khoảng trắng',
  lecturer_student_id_must_be_empty: 'giảng viên không có MSSV, hãy để trống ô này',
  duplicate_in_file: 'giá trị bị lặp trong file',
  already_exists: 'đã tồn tại trong hệ thống',
  concurrent_conflict: 'dữ liệu vừa bị thay đổi bởi thao tác khác, hãy thử lại',
  role_not_seeded: 'vai trò chưa được khởi tạo trong hệ thống, hãy liên hệ người vận hành',
  archive_limit_exceeded: 'file nén bên trong .xlsx quá lớn',
  invalid_archive: 'file .xlsx bị hỏng hoặc không đọc được',
  invalid_workbook: 'không phải bảng tính .xlsx hợp lệ',
  file_size: 'file rỗng hoặc vượt quá 5 MB',
  one_sheet_required: 'file phải có đúng một sheet',
  row_limit_exceeded: 'file vượt quá 1000 dòng dữ liệu',
  invalid_headers: 'dòng tiêu đề không đúng mẫu quy định',
  empty_file: 'file không có dòng dữ liệu nào',
};

const FIELD_NAMES: Record<ImportIssue['field'], string> = {
  mssv: 'MSSV',
  name: 'Họ tên',
  email: 'Email',
  role: 'Vai trò',
  row: 'Dòng',
};

function describeIssue(issue: ImportIssue): ApiErrorDetail {
  const reason = ISSUE_MESSAGES[issue.code] ?? issue.code;
  const where = issue.row > 0 ? `Dòng ${issue.row}` : 'File';
  return {
    field: issue.field,
    code: issue.code.toUpperCase(),
    message: `${where}, cột ${FIELD_NAMES[issue.field]}: ${reason}.`,
  };
}

export function describeAccountImportFailure(error: AccountImportFailure): {
  status: number;
  code: string;
  message: string;
  details?: ApiErrorDetail[];
} {
  const details = error.issues.map(describeIssue);
  switch (error.code) {
    case 'forbidden':
      return {
        status: 403,
        code: 'ACCOUNT_IMPORT_FORBIDDEN',
        message: 'Bạn cần vai trò quản trị viên và quyền "user:import" để nhập tài khoản từ file.',
      };
    case 'dependency_unavailable':
      return {
        status: 503,
        code: 'ACCOUNT_IMPORT_UNAVAILABLE',
        message:
          'Chưa thể nhập tài khoản: cơ sở dữ liệu không khả dụng hoặc vai trò cần thiết chưa được khởi tạo. Không có tài khoản nào được tạo.',
        details,
      };
    case 'conflict':
      return {
        status: 409,
        code: 'ACCOUNT_IMPORT_CONFLICT',
        message: `Không nhập được: ${details.length} chỗ trùng với tài khoản đã có. Toàn bộ file bị hoàn tác, không có tài khoản nào được tạo.`,
        details,
      };
    case 'invalid_rows':
      return {
        status: 400,
        code: 'ACCOUNT_IMPORT_ROWS_INVALID',
        message: `File có ${details.length} lỗi trong ${error.totalRows} dòng dữ liệu. Hãy sửa file rồi nhập lại, không có tài khoản nào được tạo.`,
        details,
      };
    case 'invalid_file':
      return {
        status: 400,
        code: 'ACCOUNT_IMPORT_FILE_INVALID',
        message: details[0]
          ? `File không hợp lệ: ${details[0].message}`
          : 'Chưa chọn file hoặc file không có đuôi .xlsx.',
        details,
      };
  }
}

@Catch(AccountImportFailure)
export class AccountImportFailureFilter implements ExceptionFilter {
  private readonly logger = new Logger(AccountImportFailureFilter.name);

  catch(error: AccountImportFailure, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const described = describeAccountImportFailure(error);
    const body = sendApiError({ request, response: http.getResponse<Response>() }, described);
    this.logger.warn({
      requestId: body.requestId,
      status: described.status,
      code: described.code,
      method: request.method,
    });
  }
}
