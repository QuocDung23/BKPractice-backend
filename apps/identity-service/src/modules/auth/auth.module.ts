import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import {
  AUTH_ACCOUNT_REPOSITORY,
  PASSWORD_CHANGE_REPOSITORY,
  AUTH_FLOW_STORE,
  BK_TOKEN_SERVICE,
  EXTERNAL_IDENTITY_REPOSITORY,
  MICROSOFT_IDENTITY_PROVIDER,
  PASSWORD_HASHER,
  REFRESH_SESSION_REPOSITORY,
  AuthTokenIssuer,
  ChangePassword,
  CompleteMicrosoftLogin,
  ExchangeMicrosoftLoginCode,
  GetCurrentAuthenticatedUser,
  LoginWithPassword,
  LogoutAllSessions,
  LogoutCurrentSession,
  RefreshSession,
  StartMicrosoftLogin,
  type AuthAccountRepository,
  type AuthFlowStore,
  type BkTokenService,
  type ExternalIdentityRepository,
  type PasswordChangeRepository,
  type MicrosoftIdentityProvider,
  type PasswordHasher,
  type RefreshSessionRepository,
  ImportAccounts,
  ACCOUNT_IMPORT_PARSER,
  ACCOUNT_IMPORT_REPOSITORY,
  type AccountImportParser,
  type AccountImportRepository,
  PASSWORD_RESET_ACCOUNTS,
  PASSWORD_RESET_STORE,
  PASSWORD_RESET_MAILER,
  SendPasswordResetOtp,
  VerifyPasswordResetOtp,
  ResetPasswordWithGrant,
  type PasswordResetAccountRepository,
  type PasswordResetStore,
  type PasswordResetMailer,
} from '@/modules/auth/application';
import {
  Argon2PasswordHasher,
  ExternalIdentity,
  AuthSession,
  JwtBkTokenService,
  MemoryAuthFlowStore,
  MsalMicrosoftIdentityProvider,
  RedisAuthFlowStore,
  RefreshToken,
  TypeormAuthAccountRepository,
  TypeormPasswordChangeRepository,
  TypeormExternalIdentityRepository,
  TypeormRefreshSessionRepository,
  TypeormAccountImportRepository,
  XlsxAccountParser,
  TypeormPasswordResetRepository,
  BrevoPasswordResetMailer,
} from '@/modules/auth/infrastructure';
import {
  AccountImportController,
  AccountImportGuard,
  AuthController,
  IdentityAccessAuthenticator,
  SessionStatusController,
  PasswordResetController,
} from '@/modules/auth/presentation';
import type { EffectivePermissionReader } from '@/modules/rbac/application/effective-permission-reader';
import { EFFECTIVE_PERMISSION_READER } from '@/modules/rbac/application/effective-permission-reader';
import { RbacModule } from '@/modules/rbac/rbac.module';
import { User } from '@/modules/users/infrastructure/persistence';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, RefreshToken, AuthSession, ExternalIdentity]),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    RbacModule,
  ],
  controllers: [
    AuthController,
    SessionStatusController,
    AccountImportController,
    PasswordResetController,
  ],
  providers: [
    AccountImportGuard,
    ThrottlerGuard,
    IdentityAccessAuthenticator,
    { provide: ACCOUNT_IMPORT_PARSER, useClass: XlsxAccountParser },
    { provide: ACCOUNT_IMPORT_REPOSITORY, useClass: TypeormAccountImportRepository },
    {
      provide: ImportAccounts,
      inject: [ACCOUNT_IMPORT_PARSER, ACCOUNT_IMPORT_REPOSITORY, PASSWORD_HASHER, ConfigService],
      useFactory: (
        parser: AccountImportParser,
        accounts: AccountImportRepository,
        passwords: PasswordHasher,
        config: ConfigService,
      ) =>
        new ImportAccounts(
          parser,
          accounts,
          passwords,
          config.getOrThrow<string>('ACCOUNT_IMPORT_PASSWORD'),
        ),
    },
    { provide: AUTH_ACCOUNT_REPOSITORY, useClass: TypeormAuthAccountRepository },
    { provide: PASSWORD_CHANGE_REPOSITORY, useClass: TypeormPasswordChangeRepository },
    { provide: EXTERNAL_IDENTITY_REPOSITORY, useClass: TypeormExternalIdentityRepository },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    {
      provide: PASSWORD_RESET_ACCOUNTS,
      inject: [DataSource, PASSWORD_HASHER, ConfigService],
      useFactory: (dataSource: DataSource, hasher: PasswordHasher, config: ConfigService) =>
        new TypeormPasswordResetRepository(dataSource, hasher, config),
    },
    { provide: PASSWORD_RESET_STORE, useExisting: PASSWORD_RESET_ACCOUNTS },
    { provide: PASSWORD_RESET_MAILER, useClass: BrevoPasswordResetMailer },
    {
      provide: SendPasswordResetOtp,
      inject: [PASSWORD_RESET_ACCOUNTS, PASSWORD_RESET_STORE, PASSWORD_RESET_MAILER],
      useFactory: (
        accounts: PasswordResetAccountRepository,
        store: PasswordResetStore,
        mailer: PasswordResetMailer,
      ) => new SendPasswordResetOtp(accounts, store, mailer),
    },
    {
      provide: VerifyPasswordResetOtp,
      inject: [PASSWORD_RESET_ACCOUNTS, PASSWORD_RESET_STORE],
      useFactory: (accounts: PasswordResetAccountRepository, store: PasswordResetStore) =>
        new VerifyPasswordResetOtp(accounts, store),
    },
    {
      provide: ResetPasswordWithGrant,
      inject: [PASSWORD_RESET_ACCOUNTS],
      useFactory: (accounts: PasswordResetAccountRepository) =>
        new ResetPasswordWithGrant(accounts),
    },
    { provide: BK_TOKEN_SERVICE, useClass: JwtBkTokenService },
    { provide: MICROSOFT_IDENTITY_PROVIDER, useClass: MsalMicrosoftIdentityProvider },
    {
      provide: AUTH_FLOW_STORE,
      inject: [ConfigService],
      useFactory: (config: ConfigService): AuthFlowStore =>
        config.getOrThrow<'redis' | 'memory'>('AUTH_FLOW_STORE') === 'memory'
          ? new MemoryAuthFlowStore()
          : new RedisAuthFlowStore(config),
    },
    {
      provide: REFRESH_SESSION_REPOSITORY,
      inject: [DataSource, PASSWORD_HASHER],
      useFactory: (dataSource: DataSource, hasher: PasswordHasher) =>
        new TypeormRefreshSessionRepository(dataSource, hasher),
    },
    {
      provide: AuthTokenIssuer,
      inject: [
        BK_TOKEN_SERVICE,
        PASSWORD_HASHER,
        REFRESH_SESSION_REPOSITORY,
        EFFECTIVE_PERMISSION_READER,
      ],
      useFactory: (
        tokens: BkTokenService,
        hasher: PasswordHasher,
        sessions: RefreshSessionRepository,
        permissions: EffectivePermissionReader,
      ) => new AuthTokenIssuer(tokens, hasher, sessions, permissions),
    },
    {
      provide: LoginWithPassword,
      inject: [AUTH_ACCOUNT_REPOSITORY, PASSWORD_HASHER, AuthTokenIssuer],
      useFactory: (
        accounts: AuthAccountRepository,
        hasher: PasswordHasher,
        issuer: AuthTokenIssuer,
      ) => new LoginWithPassword(accounts, hasher, issuer),
    },
    {
      provide: StartMicrosoftLogin,
      inject: [MICROSOFT_IDENTITY_PROVIDER, AUTH_FLOW_STORE, ConfigService],
      useFactory: (
        provider: MicrosoftIdentityProvider,
        flows: AuthFlowStore,
        config: ConfigService,
      ) =>
        new StartMicrosoftLogin(
          provider,
          flows,
          config.get<string>('AUTH_MOBILE_LOGIN_REDIRECT_URL'),
        ),
    },
    {
      provide: CompleteMicrosoftLogin,
      inject: [
        MICROSOFT_IDENTITY_PROVIDER,
        AUTH_FLOW_STORE,
        EXTERNAL_IDENTITY_REPOSITORY,
        ConfigService,
      ],
      useFactory: (
        provider: MicrosoftIdentityProvider,
        flows: AuthFlowStore,
        identities: ExternalIdentityRepository,
        config: ConfigService,
      ) =>
        new CompleteMicrosoftLogin(
          provider,
          flows,
          identities,
          config.getOrThrow<string>('AUTH_WEB_LOGIN_REDIRECT_URL'),
          config.get<string>('AUTH_MOBILE_LOGIN_REDIRECT_URL'),
        ),
    },
    {
      provide: ExchangeMicrosoftLoginCode,
      inject: [AUTH_FLOW_STORE, AUTH_ACCOUNT_REPOSITORY, AuthTokenIssuer],
      useFactory: (
        flows: AuthFlowStore,
        accounts: AuthAccountRepository,
        issuer: AuthTokenIssuer,
      ) => new ExchangeMicrosoftLoginCode(flows, accounts, issuer),
    },
    {
      provide: RefreshSession,
      inject: [
        BK_TOKEN_SERVICE,
        AUTH_ACCOUNT_REPOSITORY,
        REFRESH_SESSION_REPOSITORY,
        AuthTokenIssuer,
      ],
      useFactory: (
        tokens: BkTokenService,
        accounts: AuthAccountRepository,
        sessions: RefreshSessionRepository,
        issuer: AuthTokenIssuer,
      ) => new RefreshSession(tokens, accounts, sessions, issuer),
    },
    {
      provide: LogoutCurrentSession,
      inject: [BK_TOKEN_SERVICE, REFRESH_SESSION_REPOSITORY],
      useFactory: (tokens: BkTokenService, sessions: RefreshSessionRepository) =>
        new LogoutCurrentSession(tokens, sessions),
    },
    {
      provide: GetCurrentAuthenticatedUser,
      inject: [AUTH_ACCOUNT_REPOSITORY],
      useFactory: (accounts: AuthAccountRepository) => new GetCurrentAuthenticatedUser(accounts),
    },
    {
      provide: ChangePassword,
      inject: [PASSWORD_CHANGE_REPOSITORY, PASSWORD_HASHER],
      useFactory: (passwords: PasswordChangeRepository, hasher: PasswordHasher) =>
        new ChangePassword(passwords, hasher),
    },
    {
      provide: LogoutAllSessions,
      inject: [REFRESH_SESSION_REPOSITORY],
      useFactory: (sessions: RefreshSessionRepository) => new LogoutAllSessions(sessions),
    },
  ],
  exports: [
    BK_TOKEN_SERVICE,
    PASSWORD_HASHER,
    REFRESH_SESSION_REPOSITORY,
    IdentityAccessAuthenticator,
  ],
})
export class AuthModule {}
