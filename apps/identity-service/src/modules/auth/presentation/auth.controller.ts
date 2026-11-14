import { isAllowedBrowserOrigin, readCookie, verifyCsrfToken } from '@app/common';
import { BK_ACCESS_COOKIE_NAME, BK_CSRF_COOKIE_NAME, BK_REFRESH_COOKIE_NAME } from '@app/contracts';
import type { BkAccessClaims } from '@app/contracts';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  Req,
  Res,
  UseFilters,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import {
  BK_TOKEN_SERVICE,
  ChangePassword,
  REFRESH_SESSION_REPOSITORY,
  CompleteMicrosoftLogin,
  ExchangeMicrosoftLoginCode,
  GetCurrentAuthenticatedUser,
  LoginWithPassword,
  LogoutAllSessions,
  LogoutCurrentSession,
  RefreshSession,
  StartMicrosoftLogin,
  type BkTokenService,
} from '@/modules/auth/application';
import type {
  ClientType,
  RefreshSessionRepository,
  SessionMetadata,
} from '@/modules/auth/application/ports';
import { AuthFailure } from '@/modules/auth/domain';
import { clearAuthCookies, setAuthCookies } from '@/modules/auth/presentation/auth-cookie';
import { AuthFailureFilter } from '@/modules/auth/presentation/auth-failure.filter';
import { AUTH_HTTP_ERRORS } from '@/modules/auth/presentation/auth-http-errors';
import {
  ChangePasswordDto,
  AuthenticatedResponseDto,
  CurrentAuthUserResponseDto,
  MicrosoftCallbackDto,
  MicrosoftExchangeDto,
  RefreshTokenDto,
  PasswordLoginDto,
} from '@/modules/auth/presentation/auth.dto';

type AuthResult = { userId: string; accessToken: string; refreshToken: string };

@ApiTags('auth')
@ApiHeader({
  name: 'X-Client-Type',
  required: false,
  enum: ['web', 'mobile'],
  description: 'Selects cookie or JSON token delivery only; defaults to web',
})
@ApiHeader({
  name: 'X-CSRF-Token',
  required: false,
  description: 'Required for state-changing web requests authenticated by cookie',
})
@UseFilters(AuthFailureFilter)
@ApiResponse({ status: 400, description: 'Invalid request shape' })
@ApiResponse({ status: 401, description: 'Authentication failed' })
@ApiResponse({ status: 503, description: 'Authentication dependency unavailable' })
@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly loginUseCase: LoginWithPassword,
    private readonly startMicrosoftUseCase: StartMicrosoftLogin,
    private readonly completeMicrosoftUseCase: CompleteMicrosoftLogin,
    private readonly exchangeMicrosoftUseCase: ExchangeMicrosoftLoginCode,
    private readonly refreshUseCase: RefreshSession,
    private readonly logoutUseCase: LogoutCurrentSession,
    private readonly logoutAllUseCase: LogoutAllSessions,
    private readonly currentUserUseCase: GetCurrentAuthenticatedUser,
    private readonly changePasswordUseCase: ChangePassword,
    @Inject(BK_TOKEN_SERVICE) private readonly tokens: BkTokenService,
    @Inject(REFRESH_SESSION_REPOSITORY) private readonly sessions: RefreshSessionRepository,
    private readonly config: ConfigService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign in with student MSSV or school email and password',
    description:
      'Web returns userId and secure HttpOnly cookies; mobile returns userId and both tokens in JSON.',
  })
  @ApiResponse({ status: 200, type: AuthenticatedResponseDto })
  async login(
    @Req() request: Request,
    @Body() dto: PasswordLoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthenticatedResponseDto> {
    const clientType = this.clientType(request);
    if (clientType === 'web') this.requireOrigin(request);
    return this.deliver(
      response,
      await this.loginUseCase.execute(
        dto.identifier,
        dto.password,
        this.metadata(request, clientType),
      ),
      clientType,
    );
  }

  @Get('microsoft')
  @ApiHeader({
    name: 'X-Mobile-Code-Challenge',
    required: false,
  })
  @ApiOperation({ summary: 'Redirect to the configured school Microsoft tenant' })
  @ApiResponse({ status: 302, description: 'Microsoft authorization redirect' })
  async startMicrosoft(@Req() request: Request, @Res() response: Response): Promise<void> {
    const clientType = this.clientType(request);
    response.redirect(
      HttpStatus.FOUND,
      await this.startMicrosoftUseCase.execute(
        clientType,
        clientType === 'mobile' ? request.header('x-mobile-code-challenge') : undefined,
      ),
    );
  }

  @Get('microsoft/callback')
  @ApiOperation({ summary: 'Complete Microsoft sign-in with a one-time code' })
  @ApiResponse({ status: 302, description: 'Web or app redirect with a one-time login code' })
  async completeMicrosoft(
    @Query() query: MicrosoftCallbackDto,
    @Res() response: Response,
  ): Promise<void> {
    response.redirect(
      HttpStatus.FOUND,
      await this.completeMicrosoftUseCase.execute({
        code: query.code,
        state: query.state,
        error: query.error,
      }),
    );
  }

  @Post('microsoft/exchange')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a Microsoft login code within 60 seconds, once' })
  @ApiResponse({ status: 200, type: AuthenticatedResponseDto })
  async exchangeMicrosoft(
    @Req() request: Request,
    @Body() dto: MicrosoftExchangeDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthenticatedResponseDto> {
    const clientType = this.clientType(request);
    if (clientType === 'web') this.requireOrigin(request);
    return this.deliver(
      response,
      await this.exchangeMicrosoftUseCase.execute(
        dto.loginCode,
        this.metadata(request, clientType),
        dto.codeVerifier,
      ),
      clientType,
    );
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate a refresh token within its session',
    description:
      'Web reads the refresh cookie and checks CSRF; mobile reads refreshToken from JSON body.',
  })
  @ApiResponse({ status: 200, type: AuthenticatedResponseDto })
  async refresh(
    @Req() request: Request,
    @Body() dto: RefreshTokenDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthenticatedResponseDto> {
    const clientType = this.clientType(request);
    const rawToken = this.refreshToken(request, dto, clientType);
    if (clientType === 'web') {
      this.requireOrigin(request);
      this.requireCsrf(request, (await this.tokens.verifyRefresh(rawToken)).fid);
    }
    return this.deliver(response, await this.refreshUseCase.execute(rawToken), clientType);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Idempotently revoke the current session' })
  @ApiResponse({ status: 204 })
  async logout(
    @Req() request: Request,
    @Body() dto: RefreshTokenDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const clientType = this.clientType(request);
    if (clientType === 'web') this.requireOrigin(request);
    const refreshToken =
      clientType === 'web'
        ? (readCookie(request.header('cookie'), BK_REFRESH_COOKIE_NAME) ?? undefined)
        : dto?.refreshToken;
    let access: BkAccessClaims | null = null;
    try {
      access = await this.verifyRequestAccess(request);
    } catch (error) {
      if (!(error instanceof AuthFailure)) throw error;
    }
    let refreshSid: string | undefined;
    try {
      if (refreshToken) refreshSid = (await this.tokens.verifyRefresh(refreshToken)).fid;
    } catch (error) {
      if (!(error instanceof AuthFailure)) throw error;
    }
    if (clientType === 'web' && (refreshSid || access?.sid))
      this.requireCsrf(request, refreshSid ?? access!.sid);
    await this.logoutUseCase.execute({ userId: access?.sub, sid: access?.sid, refreshToken });
    if (clientType === 'web') clearAuthCookies(response);
  }

  @Post('logout-all')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke all sessions of the current user' })
  @ApiResponse({ status: 204 })
  async logoutAll(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const access = await this.requireAccess(request);
    if (!request.header('authorization')) {
      this.requireOrigin(request);
      this.requireCsrf(request, access.sid);
    }
    await this.logoutAllUseCase.execute(access.sub);
    if (this.clientType(request) === 'web') clearAuthCookies(response);
  }

  @Get('csrf')
  @ApiOperation({ summary: 'Read the signed CSRF value for a same-site web client' })
  async csrf(@Req() request: Request): Promise<{ csrfToken: string }> {
    const token = readCookie(request.header('cookie'), BK_CSRF_COOKIE_NAME);
    if (!token) throw AUTH_HTTP_ERRORS.notLoggedIn();
    return { csrfToken: token };
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Read the current authenticated user' })
  @ApiResponse({ status: 200, type: CurrentAuthUserResponseDto })
  async currentUser(@Req() request: Request): Promise<CurrentAuthUserResponseDto> {
    return this.currentUserUseCase.execute((await this.requireAccess(request)).sub);
  }

  @Post('password/change')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Change the current user’s local password and revoke other sessions',
  })
  @ApiResponse({ status: 204 })
  async changePassword(@Req() request: Request, @Body() dto: ChangePasswordDto): Promise<void> {
    const clientType = this.clientType(request);
    if (clientType === 'web') this.requireOrigin(request);
    const access = await this.requireAccess(request);
    if (clientType === 'web' && !request.header('authorization'))
      this.requireCsrf(request, access.sid);
    await this.changePasswordUseCase.execute(
      access.sub,
      access.sid,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  private clientType(request: Request): ClientType {
    const value = request.header('x-client-type');
    if (value === undefined || value === 'web') return 'web';
    if (value === 'mobile') return 'mobile';
    throw AUTH_HTTP_ERRORS.clientTypeInvalid();
  }

  private metadata(request: Request, clientType: ClientType): SessionMetadata {
    return {
      clientType,
      device: request.header('x-device-name') ?? undefined,
      userAgent: request.header('user-agent') ?? undefined,
      ip: request.header('x-client-ip') ?? request.ip,
    };
  }

  private refreshToken(request: Request, dto: RefreshTokenDto, clientType: ClientType): string {
    const token =
      clientType === 'web'
        ? readCookie(request.header('cookie'), BK_REFRESH_COOKIE_NAME)
        : dto?.refreshToken;
    if (!token) throw new AuthFailure('invalid_token');
    return token;
  }

  private async deliver(
    response: Response,
    result: AuthResult,
    clientType: ClientType,
  ): Promise<AuthenticatedResponseDto> {
    if (clientType === 'mobile') return result;
    const claims = await this.tokens.verifyAccessClaims(result.accessToken);
    setAuthCookies(
      response,
      result.accessToken,
      result.refreshToken,
      claims.sid,
      this.config.getOrThrow<string>('JWT_ACCESS_TTL'),
      this.config.getOrThrow<string>('JWT_REFRESH_TTL'),
      this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    );
    return { userId: result.userId };
  }

  private requireOrigin(request: Request): void {
    const origin = request.header('origin');
    const referer = request.header('referer');
    if (isAllowedBrowserOrigin(origin, referer, this.config.getOrThrow<string>('CORS_ORIGINS')))
      return;
    const host = request.header('host');
    if (
      this.config.get<string>('AUTH_FLOW_STORE') === 'memory' &&
      host &&
      /^(localhost|127\.0\.0\.1):\d+$/.test(host) &&
      isAllowedBrowserOrigin(origin, referer, `${request.protocol}://${host}`)
    )
      return;
    throw AUTH_HTTP_ERRORS.originNotAllowed();
  }

  private requireCsrf(request: Request, sid: string): void {
    if (
      !verifyCsrfToken(
        sid,
        readCookie(request.header('cookie'), BK_CSRF_COOKIE_NAME),
        request.header('x-csrf-token'),
        this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      )
    )
      throw AUTH_HTTP_ERRORS.csrfInvalid();
  }

  private async verifyRequestAccess(request: Request): Promise<BkAccessClaims> {
    const authorization = request.header('authorization');
    if (authorization !== undefined && !/^Bearer [^\s]+$/.test(authorization))
      throw new AuthFailure('invalid_token');
    const token =
      authorization?.slice(7) ?? readCookie(request.header('cookie'), BK_ACCESS_COOKIE_NAME);
    if (!token) throw new AuthFailure('invalid_token');
    return this.tokens.verifyAccessClaims(token);
  }

  private async requireAccess(request: Request): Promise<BkAccessClaims> {
    const claims = await this.verifyRequestAccess(request);
    if (!(await this.sessions.isActive(claims.sub, claims.sid)))
      throw new AuthFailure('invalid_token');
    return claims;
  }
}
