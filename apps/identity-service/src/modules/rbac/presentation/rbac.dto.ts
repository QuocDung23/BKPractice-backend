import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

import { RoleName } from '@/modules/rbac/domain';

export class AssignRoleRequestDto {
  @ApiProperty({
    enum: RoleName,
    description: 'ADMIN may be assigned only to another account.',
  })
  @IsEnum(RoleName)
  role!: RoleName;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class RevokeRoleRequestDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class UserRolesResponseDto {
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ enum: RoleName, isArray: true })
  roles!: RoleName[];
}
