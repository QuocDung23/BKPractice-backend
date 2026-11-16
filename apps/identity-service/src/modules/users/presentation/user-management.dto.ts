import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

import { RoleName } from '@/modules/rbac/domain';

export class ListUsersQueryDto {
  @ApiPropertyOptional({ example: '1' })
  @IsOptional()
  @Matches(/^[1-9]\d*$/)
  page?: string;

  @ApiPropertyOptional({ example: '20' })
  @IsOptional()
  @Matches(/^[1-9]\d*$/)
  limit?: string;

  @ApiPropertyOptional({ enum: ['true', 'false'], example: 'false' })
  @IsOptional()
  @IsIn(['true', 'false'])
  includeDeleted?: string;

  @ApiPropertyOptional({ description: 'Search student ID, email or display name' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({ enum: RoleName })
  @IsOptional()
  @IsEnum(RoleName)
  role?: RoleName;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'LOCKED', 'PENDING'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'LOCKED', 'PENDING'])
  status?: 'ACTIVE' | 'LOCKED' | 'PENDING';
}

export class CreateManagedUserDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  studentId?: string | null;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  displayName!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ writeOnly: true })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ enum: RoleName })
  @IsEnum(RoleName)
  role!: RoleName;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class ChangeManagedUserStatusDto {
  @ApiProperty({ enum: ['ACTIVE', 'LOCKED'] })
  @IsIn(['ACTIVE', 'LOCKED'])
  status!: 'ACTIVE' | 'LOCKED';

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class AdminReasonDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class UserAdminResponseDto {
  @ApiProperty() userId!: string;
  @ApiProperty({ type: String, nullable: true }) studentId!: string | null;
  @ApiProperty() email!: string;
  @ApiProperty({ type: String, nullable: true }) displayName!: string | null;
  @ApiProperty({ enum: ['ACTIVE', 'LOCKED', 'PENDING'] }) status!: string;
  @ApiProperty({ type: [String] }) roles!: string[];
  @ApiProperty({ type: Date }) createdAt!: Date;
  @ApiProperty({ type: Date, nullable: true }) deletedAt!: Date | null;
}

export class ListUsersResponseDto {
  @ApiProperty({ type: [UserAdminResponseDto] }) items!: UserAdminResponseDto[];
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() hasMore!: boolean;
}
