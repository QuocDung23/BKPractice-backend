import { RequestIdMiddleware } from '@app/common';
import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';

import { AuthModule } from '@/modules/auth';
import { PASSWORD_HASHER, type PasswordHasher } from '@/modules/auth/application';
import {
  USER_MANAGEMENT_REPOSITORY,
  UserManagementUseCases,
  type UserManagementRepository,
} from '@/modules/users/application';
import { TypeormUserManagementRepository } from '@/modules/users/infrastructure/persistence';
import {
  QuizShareRecipientController,
  StudentRosterController,
  UserManagementController,
} from '@/modules/users/presentation';

@Module({
  imports: [AuthModule],
  controllers: [UserManagementController, StudentRosterController, QuizShareRecipientController],
  providers: [
    TypeormUserManagementRepository,
    { provide: USER_MANAGEMENT_REPOSITORY, useExisting: TypeormUserManagementRepository },
    {
      provide: UserManagementUseCases,
      inject: [USER_MANAGEMENT_REPOSITORY, PASSWORD_HASHER],
      useFactory: (users: UserManagementRepository, passwords: PasswordHasher) =>
        new UserManagementUseCases(users, passwords),
    },
  ],
})
export class UsersModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes(UserManagementController);
  }
}
