import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  Inject,
  Query,
  ServiceUnavailableException,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, Max, Min } from 'class-validator';

import {
  GET_LEADERBOARD,
  IneligibleLeaderboardViewer,
  LeaderboardProfilesUnavailable,
  type GetLeaderboard,
  type LeaderboardPeriod,
} from './leaderboard';

import { InternalServiceGuard } from '@/modules/problems/internal-service.guard';
import { TrustedPrincipal } from '@/modules/problems/presentation/http/decorators/trusted-principal.decorator';
import { TrustedPrincipalGuard } from '@/modules/problems/presentation/http/guards/trusted-principal.guard';
import type { Principal } from '@/modules/progress/application/models';
import { ProgressExceptionFilter } from '@/modules/progress/presentation/http/filters';

class LeaderboardQueryDto {
  @ApiPropertyOptional({ enum: ['week', 'month'], default: 'week' })
  @IsIn(['week', 'month'])
  period: LeaderboardPeriod = 'week';

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  page = 1;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 10;
}

@ApiTags('leaderboard')
@ApiBearerAuth()
@UseGuards(InternalServiceGuard, TrustedPrincipalGuard)
@UseFilters(ProgressExceptionFilter)
@Controller('api/leaderboard')
export class LeaderboardController {
  constructor(@Inject(GET_LEADERBOARD) private readonly getLeaderboard: GetLeaderboard) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Rank active students by practice XP in the current week or month' })
  async get(@TrustedPrincipal() principal: Principal, @Query() query: LeaderboardQueryDto) {
    if (!principal.roles.includes('STUDENT')) throw new ForbiddenException();
    try {
      return await this.getLeaderboard(query, principal.userId);
    } catch (error) {
      if (error instanceof IneligibleLeaderboardViewer) throw new ForbiddenException();
      if (error instanceof LeaderboardProfilesUnavailable) throw new ServiceUnavailableException();
      throw error;
    }
  }
}
