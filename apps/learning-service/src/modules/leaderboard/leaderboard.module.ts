import { Module } from '@nestjs/common';

import { GET_LEADERBOARD, getLeaderboard, type GetLeaderboard } from './leaderboard';
import { LeaderboardReaders } from './leaderboard-readers';
import { LeaderboardController } from './leaderboard.controller';

import { InternalServiceGuard } from '@/modules/problems/internal-service.guard';
import { TrustedPrincipalGuard } from '@/modules/problems/presentation/http/guards/trusted-principal.guard';

@Module({
  controllers: [LeaderboardController],
  providers: [
    LeaderboardReaders,
    InternalServiceGuard,
    TrustedPrincipalGuard,
    {
      provide: GET_LEADERBOARD,
      inject: [LeaderboardReaders],
      useFactory:
        (readers: LeaderboardReaders): GetLeaderboard =>
        (query, viewerId) =>
          getLeaderboard(query, viewerId, readers),
    },
  ],
})
export class LeaderboardModule {}
