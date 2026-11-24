import { timingSafeEqual } from 'node:crypto';

import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsUUID } from 'class-validator';

import { ProfileUseCases } from '@/modules/profiles/application';
import { USER_HTTP_ERRORS } from '@/modules/users/presentation/user-management-errors';

class LeaderboardProfilesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID(undefined, { each: true })
  userIds!: string[];

  @IsBoolean()
  includeProfiles!: boolean;
}

@ApiExcludeController()
@Controller('internal/profiles')
export class LeaderboardProfilesController {
  constructor(
    private readonly profiles: ProfileUseCases,
    private readonly config: ConfigService,
  ) {}

  @Post('leaderboard')
  @HttpCode(200)
  async list(
    @Body() body: LeaderboardProfilesDto,
    @Headers('x-internal-service-secret') provided?: string,
  ) {
    const expected = this.config.get<string>('INTERNAL_SERVICE_SECRET');
    if (!expected) throw USER_HTTP_ERRORS.internalLookupUnavailable();
    const secret = Buffer.from(expected);
    const actual = Buffer.from(provided ?? '');
    if (actual.length !== secret.length || !timingSafeEqual(actual, secret)) {
      throw USER_HTTP_ERRORS.internalCredentialInvalid();
    }
    return this.profiles.listLeaderboardStudents(body.userIds, body.includeProfiles);
  }
}
