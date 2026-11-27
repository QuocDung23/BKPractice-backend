import { AppHttpException } from '@app/common';
import { Controller, Get, Header, Inject, Query, UseFilters, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
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

class LeaderboardEntryDto {
  @ApiProperty() userId!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ type: String, nullable: true }) avatar!: string | null;
  @ApiProperty({ type: Number, nullable: true }) rank!: number | null;
  @ApiProperty() xp!: number;
  @ApiProperty() solved!: number;
  @ApiProperty() quizzesPassed!: number;
}

class LeaderboardResponseDto {
  @ApiProperty({ enum: ['week', 'month'] }) period!: string;
  @ApiProperty({ type: String, format: 'date-time' }) from!: string;
  @ApiProperty({ type: String, format: 'date-time' }) to!: string;
  @ApiProperty({ type: String, format: 'date-time' }) generatedAt!: string;
  @ApiProperty({ type: [LeaderboardEntryDto] }) top!: LeaderboardEntryDto[];
  @ApiProperty({ type: [LeaderboardEntryDto] }) rows!: LeaderboardEntryDto[];
  @ApiProperty() totalItems!: number;
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty({ type: LeaderboardEntryDto }) me!: LeaderboardEntryDto;
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
  @ApiOkResponse({ type: LeaderboardResponseDto })
  async get(@TrustedPrincipal() principal: Principal, @Query() query: LeaderboardQueryDto) {
    if (!principal.roles.includes('STUDENT'))
      throw new AppHttpException(
        403,
        'LEADERBOARD_STUDENT_REQUIRED',
        'Bảng xếp hạng luyện tập dành cho tài khoản sinh viên.',
      );
    try {
      return await this.getLeaderboard(query, principal.userId);
    } catch (error) {
      if (error instanceof IneligibleLeaderboardViewer)
        throw new AppHttpException(
          403,
          'LEADERBOARD_VIEWER_INELIGIBLE',
          'Bảng xếp hạng chỉ dành cho tài khoản sinh viên đang hoạt động.',
        );
      if (error instanceof LeaderboardProfilesUnavailable)
        throw new AppHttpException(
          503,
          'LEADERBOARD_PROFILES_UNAVAILABLE',
          'Chưa lấy được hồ sơ sinh viên để hiển thị bảng xếp hạng. Vui lòng thử lại sau ít phút.',
        );
      throw error;
    }
  }
}
