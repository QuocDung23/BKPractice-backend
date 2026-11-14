import { timingSafeEqual } from 'node:crypto';

import { Controller, Get, Headers, Query, UseFilters } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

import { UserManagementUseCases } from '@/modules/users/application';
import { USER_HTTP_ERRORS } from '@/modules/users/presentation/user-management-errors';
import { UserManagementFailureFilter } from '@/modules/users/presentation/user-management-failure.filter';

class StudentRosterQueryDto {
  @IsOptional()
  @Matches(/^[1-9]\d*$/)
  page?: string;

  @IsOptional()
  @Matches(/^[1-9]\d*$/)
  limit?: string;
}

@ApiExcludeController()
@UseFilters(UserManagementFailureFilter)
@Controller('internal/users')
export class StudentRosterController {
  constructor(
    private readonly users: UserManagementUseCases,
    private readonly config: ConfigService,
  ) {}

  @Get('students')
  async list(
    @Headers('x-internal-service-secret') provided: string | undefined,
    @Query() query: StudentRosterQueryDto,
  ): Promise<{
    items: Array<{ userId: string; studentId: string | null; displayName: string | null }>;
    page: number;
    limit: number;
    hasMore: boolean;
  }> {
    const expected = this.config.getOrThrow<string>('INTERNAL_SERVICE_SECRET');
    if (
      !provided ||
      Buffer.byteLength(provided) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
    )
      throw USER_HTTP_ERRORS.internalCredentialInvalid();
    return this.users.listStudents(
      query.page === undefined ? 1 : Number(query.page),
      query.limit === undefined ? 20 : Number(query.limit),
    );
  }
}
