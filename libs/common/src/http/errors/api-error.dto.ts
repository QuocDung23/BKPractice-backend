import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Mô tả Swagger của `ApiErrorDetail` (spec ERR-001 FR-013). */
export class ApiErrorDetailDto {
  @ApiPropertyOptional({ example: 'email', description: 'Tên trường gắn với lỗi, nếu có.' })
  field?: string;

  @ApiProperty({
    example: 'INVALID_FORMAT',
    description: 'Mã máy đọc được của ràng buộc bị vi phạm.',
  })
  code!: string;

  @ApiProperty({ example: 'Trường "email" không phải là email hợp lệ.' })
  message!: string;
}

/** Mô tả Swagger của `ApiErrorBody`: định dạng chung của mọi phản hồi lỗi (spec ERR-001 FR-001). */
export class ApiErrorResponseDto {
  @ApiProperty({ example: 400, description: 'Trùng với status HTTP của phản hồi.' })
  statusCode!: number;

  @ApiProperty({
    example: 'VALIDATION_FAILED',
    description: 'Mã lỗi ổn định, dùng để rẽ nhánh xử lý ở client; không đổi giữa các phiên bản.',
  })
  code!: string;

  @ApiProperty({
    example: 'Dữ liệu gửi lên chưa hợp lệ: 1 trường cần sửa.',
    description: 'Thông báo tiếng Việt nêu nguyên nhân và hướng xử lý.',
  })
  message!: string;

  @ApiPropertyOptional({
    type: [ApiErrorDetailDto],
    description: 'Chi tiết theo từng trường hoặc dòng.',
  })
  details?: ApiErrorDetailDto[];

  @ApiProperty({
    example: '0b8f3a52-6c1d-4e7a-9b2f-3d5e8a1c4f70',
    description: 'Mã tham chiếu để người vận hành dò log.',
  })
  requestId!: string;
}
