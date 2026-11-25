import type { Principal } from '@learning/modules/problems/application/models/principal';
import {
  CREATE_PROBLEM_PORT_IN,
  type ICreateProblemPortIn,
} from '@learning/modules/problems/application/ports/in/create-problem.port.in';
import {
  GET_MANAGED_PROBLEM_PORT_IN,
  type IGetManagedProblemPortIn,
} from '@learning/modules/problems/application/ports/in/get-managed-problem.port.in';
import {
  HOLD_PROBLEM_PORT_IN,
  type IHoldProblemPortIn,
} from '@learning/modules/problems/application/ports/in/hold-problem.port.in';
import {
  LIST_MANAGED_PROBLEMS_PORT_IN,
  type IListManagedProblemsPortIn,
} from '@learning/modules/problems/application/ports/in/list-managed-problems.port.in';
import {
  PREVIEW_PROBLEM_PORT_IN,
  type IPreviewProblemPortIn,
} from '@learning/modules/problems/application/ports/in/preview-problem.port.in';
import {
  PUBLISH_PROBLEM_PORT_IN,
  type IPublishProblemPortIn,
} from '@learning/modules/problems/application/ports/in/publish-problem.port.in';
import {
  REPUBLISH_PROBLEM_PORT_IN,
  type IRepublishProblemPortIn,
} from '@learning/modules/problems/application/ports/in/republish-problem.port.in';
import {
  RESTORE_PROBLEM_PORT_IN,
  type IRestoreProblemPortIn,
} from '@learning/modules/problems/application/ports/in/restore-problem.port.in';
import {
  SOFT_DELETE_PROBLEM_PORT_IN,
  type ISoftDeleteProblemPortIn,
} from '@learning/modules/problems/application/ports/in/soft-delete-problem.port.in';
import {
  UPDATE_PROBLEM_PORT_IN,
  type IUpdateProblemPortIn,
} from '@learning/modules/problems/application/ports/in/update-problem.port.in';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseFilters,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { TrustedPrincipal } from './decorators/trusted-principal.decorator';
import { CreateProblemRequestDto } from './dto/create-problem.request.dto';
import { IncludeDeletedQueryDto, ManagedProblemQueryDto } from './dto/problem-query.dto';
import {
  ManagedProblemListResponseDto,
  ManagedProblemResponseDto,
  SoftDeleteProblemResponseDto,
} from './dto/problem-response.dto';
import { UpdateProblemRequestDto } from './dto/update-problem.request.dto';
import { ProblemExceptionFilter } from './filters/problem-exception.filter';
import { ProblemRequestMapper } from './mappers/problem-request.mapper';
import { ProblemResponseMapper } from './mappers/problem-response.mapper';

@ApiTags('problems')
@ApiBearerAuth()
@UseFilters(ProblemExceptionFilter)
@Controller('api/problems')
export class ManagedProblemsController {
  constructor(
    @Inject(CREATE_PROBLEM_PORT_IN)
    private readonly createProblem: ICreateProblemPortIn,
    @Inject(UPDATE_PROBLEM_PORT_IN)
    private readonly updateProblem: IUpdateProblemPortIn,
    @Inject(PUBLISH_PROBLEM_PORT_IN)
    private readonly publishProblem: IPublishProblemPortIn,
    @Inject(HOLD_PROBLEM_PORT_IN)
    private readonly holdProblem: IHoldProblemPortIn,
    @Inject(REPUBLISH_PROBLEM_PORT_IN)
    private readonly republishProblem: IRepublishProblemPortIn,
    @Inject(SOFT_DELETE_PROBLEM_PORT_IN)
    private readonly softDeleteProblem: ISoftDeleteProblemPortIn,
    @Inject(RESTORE_PROBLEM_PORT_IN)
    private readonly restoreProblem: IRestoreProblemPortIn,
    @Inject(GET_MANAGED_PROBLEM_PORT_IN)
    private readonly getManagedProblem: IGetManagedProblemPortIn,
    @Inject(LIST_MANAGED_PROBLEMS_PORT_IN)
    private readonly listManagedProblems: IListManagedProblemsPortIn,
    @Inject(PREVIEW_PROBLEM_PORT_IN)
    private readonly previewProblem: IPreviewProblemPortIn,
    private readonly requestMapper: ProblemRequestMapper,
    private readonly responseMapper: ProblemResponseMapper,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a draft problem',
    description:
      'Creates a new DRAFT problem. Requires problem:create permission. The slug is generated from the title unless supplied. Required fields: title, statement, problemType, difficulty.',
  })
  @ApiOkResponse({ type: ManagedProblemResponseDto, description: 'Created draft problem' })
  @ApiBadRequestResponse({ description: 'Validation error, duplicate slug, or unknown reference' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Missing ADMIN role or problem:create permission' })
  @ApiConflictResponse({ description: 'Slug already exists' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error' })
  async create(
    @TrustedPrincipal() principal: Principal,
    @Body() dto: CreateProblemRequestDto,
  ): Promise<ManagedProblemResponseDto> {
    const result = await this.createProblem.execute(
      principal,
      this.requestMapper.toCreateCommand(dto),
    );
    return this.responseMapper.toManagedDetail(result, false);
  }

  @Get('managed')
  @ApiOperation({
    summary: 'List managed problems',
    description:
      'Lecturers see their own problems; admins can see all problems. Supports title or slug search, publication status, and inclusion of soft-deleted problems.',
  })
  @ApiOkResponse({
    type: ManagedProblemListResponseDto,
    description: 'Paginated list of managed problems',
  })
  @ApiBadRequestResponse({ description: 'Invalid query parameters' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({ description: 'Missing permission to list managed problems' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error' })
  async listManaged(
    @TrustedPrincipal() principal: Principal,
    @Query() query: ManagedProblemQueryDto,
  ): Promise<ManagedProblemListResponseDto> {
    const page = await this.listManagedProblems.execute(principal, query);
    return this.responseMapper.toManagedPage(page, query.includeDeleted);
  }

  @Get('managed/:id')
  @ApiOperation({
    summary: 'Get a managed problem',
    description:
      'Returns full problem details including readiness. Requires ownership. By default deleted problems are hidden; use includeDeleted=true to view them.',
  })
  @ApiOkResponse({ type: ManagedProblemResponseDto, description: 'Managed problem details' })
  @ApiBadRequestResponse({ description: 'Invalid UUID' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({
    description: 'Missing ADMIN role, problem:read-managed permission, or not the owner',
  })
  @ApiNotFoundResponse({ description: 'Problem not found' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error' })
  async getManaged(
    @TrustedPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: IncludeDeletedQueryDto,
  ): Promise<ManagedProblemResponseDto> {
    const result = await this.getManagedProblem.execute(principal, id, query.includeDeleted);
    return this.responseMapper.toManagedDetail(result, query.includeDeleted);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a problem owned by the current admin',
    description:
      'Updates a problem. Only the owner (creator) can update. DRAFT and PUBLISHED problems can be updated; ON_HOLD problems return 409. Semantics: field absent = keep current value, null = clear nullable field, empty array = clear collection. The slug field is not accepted.',
  })
  @ApiOkResponse({ type: ManagedProblemResponseDto, description: 'Updated problem' })
  @ApiBadRequestResponse({ description: 'Validation error, unknown reference, or slug in body' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({
    description: 'Missing ADMIN role, problem:update permission, or not the owner',
  })
  @ApiNotFoundResponse({ description: 'Problem not found' })
  @ApiConflictResponse({ description: 'Problem is ON_HOLD or concurrent modification' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error' })
  async update(
    @TrustedPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProblemRequestDto,
  ): Promise<ManagedProblemResponseDto> {
    const result = await this.updateProblem.execute(
      principal,
      id,
      this.requestMapper.toUpdateCommand(dto),
    );
    return this.responseMapper.toManagedDetail(result, false);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Publish a draft problem',
    description:
      'Publishes a DRAFT problem. Validates readiness (enabled languages, contracts, starter codes, limits, etc.). Returns 400 with issues if not ready. Only the owner can publish.',
  })
  @ApiOkResponse({ type: ManagedProblemResponseDto, description: 'Published problem' })
  @ApiBadRequestResponse({
    description: 'Problem not ready to publish (issues in response)',
    headers: { issues: { description: 'Array of readiness issues' } },
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({
    description: 'Missing ADMIN role, problem:publish permission, or not the owner',
  })
  @ApiNotFoundResponse({ description: 'Problem not found' })
  @ApiConflictResponse({ description: 'Problem is not DRAFT or concurrent modification' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error' })
  async publish(
    @TrustedPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ManagedProblemResponseDto> {
    const result = await this.publishProblem.execute(principal, id);
    return this.responseMapper.toManagedDetail(result, false);
  }

  @Post(':id/hold')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Move a published problem on hold',
    description:
      'Moves a PUBLISHED problem to ON_HOLD. The problem becomes invisible in public listings. Only the owner can hold.',
  })
  @ApiOkResponse({ type: ManagedProblemResponseDto, description: 'Problem on hold' })
  @ApiBadRequestResponse({ description: 'Validation error' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({
    description: 'Missing ADMIN role, problem:hold permission, or not the owner',
  })
  @ApiNotFoundResponse({ description: 'Problem not found' })
  @ApiConflictResponse({ description: 'Problem is not PUBLISHED or concurrent modification' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error' })
  async hold(
    @TrustedPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ManagedProblemResponseDto> {
    const result = await this.holdProblem.execute(principal, id);
    return this.responseMapper.toManagedDetail(result, false);
  }

  @Post(':id/republish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Republish a problem on hold',
    description: 'Republishes an ON_HOLD problem back to PUBLISHED. Only the owner can republish.',
  })
  @ApiOkResponse({ type: ManagedProblemResponseDto, description: 'Republished problem' })
  @ApiBadRequestResponse({ description: 'Validation error' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({
    description: 'Missing ADMIN role, problem:republish permission, or not the owner',
  })
  @ApiNotFoundResponse({ description: 'Problem not found' })
  @ApiConflictResponse({ description: 'Problem is not ON_HOLD or concurrent modification' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error' })
  async republish(
    @TrustedPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ManagedProblemResponseDto> {
    const result = await this.republishProblem.execute(principal, id);
    return this.responseMapper.toManagedDetail(result, false);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Soft-delete a published or held problem',
    description:
      'Soft-deletes a PUBLISHED or ON_HOLD problem. The problem is hidden from public listings. Returns deletedAt timestamp. DRAFT problems cannot be deleted (409). Only the owner can delete.',
  })
  @ApiOkResponse({ type: SoftDeleteProblemResponseDto, description: 'Soft-deleted problem' })
  @ApiBadRequestResponse({ description: 'Validation error' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({
    description: 'Missing ADMIN role, problem:delete permission, or not the owner',
  })
  @ApiNotFoundResponse({ description: 'Problem not found' })
  @ApiConflictResponse({ description: 'Problem is DRAFT or concurrent modification' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error' })
  async remove(
    @TrustedPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SoftDeleteProblemResponseDto> {
    const result = await this.softDeleteProblem.execute(principal, id);
    return this.responseMapper.toSoftDelete(result);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restore a soft-deleted problem',
    description:
      'Restores a soft-deleted problem to its previous status (PUBLISHED or ON_HOLD). Only the owner can restore.',
  })
  @ApiOkResponse({ type: ManagedProblemResponseDto, description: 'Restored problem' })
  @ApiBadRequestResponse({ description: 'Validation error' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({
    description: 'Missing ADMIN role, problem:restore permission, or not the owner',
  })
  @ApiNotFoundResponse({ description: 'Problem not found' })
  @ApiConflictResponse({ description: 'Problem is not deleted or concurrent modification' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error' })
  async restore(
    @TrustedPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ManagedProblemResponseDto> {
    const result = await this.restoreProblem.execute(principal, id);
    return this.responseMapper.toManagedDetail(result, false);
  }

  @Post(':id/preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Preview a problem including a deleted one',
    description:
      'Returns full managed problem details for preview. Works for DRAFT, PUBLISHED, ON_HOLD, and deleted problems. Does not change status or execute anything. Includes deletedAt if the problem is deleted.',
  })
  @ApiOkResponse({ type: ManagedProblemResponseDto, description: 'Preview problem details' })
  @ApiBadRequestResponse({ description: 'Invalid UUID' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  @ApiForbiddenResponse({
    description: 'Missing ADMIN role, problem:read-managed permission, or not the owner',
  })
  @ApiNotFoundResponse({ description: 'Problem not found' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error' })
  async preview(
    @TrustedPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ManagedProblemResponseDto> {
    const result = await this.previewProblem.execute(principal, id);
    return this.responseMapper.toPreviewDetail(result, true);
  }
}
