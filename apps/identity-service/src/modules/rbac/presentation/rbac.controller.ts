import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Req,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { AuthFailureFilter } from '@/modules/auth/presentation';
import { AssignRoleToUser, GetUserRoles, RevokeRoleFromUser } from '@/modules/rbac/application';
import { RoleName } from '@/modules/rbac/domain';
import { RbacFailureFilter } from '@/modules/rbac/presentation/rbac-failure.filter';
import {
  AssignRoleRequestDto,
  RevokeRoleRequestDto,
  UserRolesResponseDto,
} from '@/modules/rbac/presentation/rbac.dto';
import { RbacGuard, type RbacRequest } from '@/modules/rbac/presentation/rbac.guard';
import { RbacInterceptor } from '@/modules/rbac/presentation/rbac.interceptor';

@ApiTags('roles')
@ApiBearerAuth()
@UseGuards(RbacGuard)
@UseInterceptors(RbacInterceptor)
@UseFilters(AuthFailureFilter, RbacFailureFilter)
@ApiResponse({ status: 200, type: UserRolesResponseDto })
@ApiResponse({ status: 400, description: 'Invalid request' })
@ApiResponse({ status: 401, description: 'Authentication failed' })
@ApiResponse({ status: 403, description: 'Administrator role required or role change forbidden' })
@ApiResponse({ status: 404, description: 'Target user not found' })
@ApiResponse({ status: 409, description: 'Last administrator protected' })
@Controller('api/roles/users')
export class RbacController {
  constructor(
    private readonly getRoles: GetUserRoles,
    private readonly assignRole: AssignRoleToUser,
    private readonly revokeRole: RevokeRoleFromUser,
  ) {}

  @Get(':userId')
  @ApiOperation({ summary: 'Read user roles (ADMIN only)' })
  get(
    @Req() request: RbacRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<UserRolesResponseDto> {
    return this.getRoles.execute(request.principal, userId);
  }

  @Post(':userId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Assign STUDENT, LECTURER or ADMIN with a reason (ADMIN only)' })
  assign(
    @Req() request: RbacRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: AssignRoleRequestDto,
  ): Promise<UserRolesResponseDto> {
    return this.assignRole.execute(request.principal, userId, dto.role, dto.reason);
  }

  @Delete(':userId/:role')
  @ApiOperation({
    summary: 'Revoke a role with a reason; preserve the last active ADMIN',
  })
  revoke(
    @Req() request: RbacRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('role', new ParseEnumPipe(RoleName)) role: RoleName,
    @Body() dto: RevokeRoleRequestDto,
  ): Promise<UserRolesResponseDto> {
    return this.revokeRole.execute(request.principal, userId, role, dto.reason);
  }
}
