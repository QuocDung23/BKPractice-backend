import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Logger,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseFilters,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

import { AuthFailureFilter, IdentityAccessAuthenticator } from '@/modules/auth/presentation';
import type { AuthorizationPrincipal } from '@/modules/rbac/domain';
import { UserManagementUseCases } from '@/modules/users/application';
import { UserManagementFailureFilter } from '@/modules/users/presentation/user-management-failure.filter';
import {
  AdminReasonDto,
  ChangeManagedUserStatusDto,
  CreateManagedUserDto,
  ListUsersQueryDto,
  ListUsersResponseDto,
  UserAdminResponseDto,
} from '@/modules/users/presentation/user-management.dto';

export interface UserAdminRequest extends Request {
  principal?: AuthorizationPrincipal;
}

@ApiTags('user administration')
@ApiBearerAuth()
@UseFilters(AuthFailureFilter, UserManagementFailureFilter)
@ApiResponse({ status: 400, description: 'Invalid UUID or query' })
@ApiResponse({ status: 401, description: 'Authentication failed' })
@ApiResponse({ status: 403, description: 'ADMIN role and permission required' })
@ApiResponse({ status: 404, description: 'User unavailable' })
@Controller('api/admin/users')
export class UserManagementController {
  private readonly logger = new Logger(UserManagementController.name);

  constructor(
    private readonly users: UserManagementUseCases,
    private readonly access: IdentityAccessAuthenticator,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List users (ADMIN + user:read)' })
  @ApiResponse({ status: 200, type: ListUsersResponseDto })
  async list(
    @Req() request: UserAdminRequest,
    @Query() query: ListUsersQueryDto,
  ): Promise<ListUsersResponseDto> {
    const principal = await this.verifyPrincipal(request);
    const result = await this.users.listUsers(
      principal,
      query.page === undefined ? 1 : Number(query.page),
      query.limit === undefined ? 20 : Number(query.limit),
      query.includeDeleted === 'true',
      { q: query.q?.trim() || undefined, role: query.role, status: query.status },
    );
    this.logSuccess(request);
    return result;
  }

  @Post()
  @ApiOperation({ summary: 'Create a STUDENT, LECTURER or ADMIN account' })
  @ApiResponse({ status: 201, type: UserAdminResponseDto })
  async create(
    @Req() request: UserAdminRequest,
    @Body() body: CreateManagedUserDto,
  ): Promise<UserAdminResponseDto> {
    const result = await this.users.createUser(await this.verifyPrincipal(request), {
      studentId: body.studentId ?? null,
      displayName: body.displayName,
      email: body.email,
      password: body.password,
      role: body.role,
      reason: body.reason,
    });
    this.logSuccess(request);
    return result;
  }

  @Patch(':userId/status')
  @ApiOperation({ summary: 'Lock or unlock an account with a reason' })
  @ApiResponse({ status: 200, type: UserAdminResponseDto })
  async setStatus(
    @Req() request: UserAdminRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: ChangeManagedUserStatusDto,
  ): Promise<UserAdminResponseDto> {
    const result = await this.users.setStatus(
      await this.verifyPrincipal(request),
      userId,
      body.status,
      body.reason,
    );
    this.logSuccess(request);
    return result;
  }

  @Get(':userId')
  @ApiOperation({ summary: 'Read a user, including a deleted user (ADMIN + user:read)' })
  @ApiResponse({ status: 200, type: UserAdminResponseDto })
  async get(
    @Req() request: UserAdminRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<UserAdminResponseDto> {
    const result = await this.users.getUser(await this.verifyPrincipal(request), userId);
    this.logSuccess(request);
    return result;
  }

  @Delete(':userId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Soft-delete an account with a reason (ADMIN + user:delete)' })
  @ApiResponse({ status: 204, description: 'Deleted or already deleted' })
  async delete(
    @Req() request: UserAdminRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: AdminReasonDto,
  ): Promise<void> {
    await this.users.deleteUser(await this.verifyPrincipal(request), userId, body.reason);
    this.logSuccess(request);
  }

  private async verifyPrincipal(request: UserAdminRequest): Promise<AuthorizationPrincipal> {
    const claims = await this.access.verify(request);
    request.principal = {
      userId: claims.sub,
      roles: claims.roles,
      permissions: claims.permissions,
    };
    return request.principal;
  }

  private logSuccess(request: UserAdminRequest): void {
    const requestId = request.header('x-request-id');
    this.logger.log({
      operation: request.method,
      outcome: 'success',
      actorId: request.principal?.userId,
      requestId:
        requestId && /^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$/.test(requestId)
          ? requestId
          : undefined,
    });
  }
}
