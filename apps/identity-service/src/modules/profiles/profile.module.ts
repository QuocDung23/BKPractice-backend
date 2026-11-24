import { RequestIdMiddleware } from '@app/common';
import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';

import { AuthModule } from '@/modules/auth';
import {
  AVATAR_STORAGE,
  PROFILE_ACCOUNT_CONTEXT,
  PROFILE_REPOSITORY,
  ProfileUseCases,
  type AvatarStorage,
  type IdentityProfileContext,
  type ProfileRepository,
} from '@/modules/profiles/application';
import {
  R2AvatarStorage,
  TypeormProfileAccountContext,
  TypeormProfileRepository,
} from '@/modules/profiles/infrastructure';
import { ProfileController } from '@/modules/profiles/presentation';
import { LeaderboardProfilesController } from '@/modules/profiles/presentation/leaderboard-profiles.controller';

@Module({
  imports: [AuthModule],
  controllers: [ProfileController, LeaderboardProfilesController],
  providers: [
    TypeormProfileAccountContext,
    TypeormProfileRepository,
    R2AvatarStorage,
    { provide: PROFILE_ACCOUNT_CONTEXT, useExisting: TypeormProfileAccountContext },
    { provide: PROFILE_REPOSITORY, useExisting: TypeormProfileRepository },
    { provide: AVATAR_STORAGE, useExisting: R2AvatarStorage },
    {
      provide: ProfileUseCases,
      inject: [PROFILE_ACCOUNT_CONTEXT, PROFILE_REPOSITORY, AVATAR_STORAGE],
      useFactory: (
        accounts: IdentityProfileContext,
        profiles: ProfileRepository,
        avatars: AvatarStorage,
      ) => new ProfileUseCases(accounts, profiles, avatars),
    },
  ],
})
export class ProfileModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes(ProfileController, LeaderboardProfilesController);
  }
}
