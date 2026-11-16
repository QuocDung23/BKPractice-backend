import { isAllowedBrowserOrigin } from '@app/common';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

import {
  ResetPasswordWithGrant,
  SendPasswordResetOtp,
  VerifyPasswordResetOtp,
} from '@/modules/auth/application';
import { AUTH_HTTP_ERRORS } from '@/modules/auth/presentation/auth-http-errors';
import { PasswordResetFailureFilter } from '@/modules/auth/presentation/password-reset-failure.filter';
import {
  PasswordResetTokenResponseDto,
  ResetPasswordWithGrantDto,
  SendPasswordResetOtpDto,
  VerifyPasswordResetOtpDto,
} from '@/modules/auth/presentation/password-reset.dto';

@ApiTags('auth')
@Controller('api/auth/password')
@UseFilters(PasswordResetFailureFilter)
@UseGuards(ThrottlerGuard)
@ApiResponse({ status: 400, description: 'Invalid request, OTP, grant or password' })
@ApiResponse({ status: 503, description: 'Password reset dependency unavailable' })
export class PasswordResetController {
  constructor(
    private readonly sendOtp: SendPasswordResetOtp,
    private readonly verifyOtp: VerifyPasswordResetOtp,
    private readonly reset: ResetPasswordWithGrant,
    private readonly config: ConfigService,
  ) {}

  @Post('send-otp')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Request a school email OTP with an account-neutral response' })
  @ApiResponse({
    status: 202,
    description: 'Accepted whether or not an eligible account or mail delivery exists',
  })
  async send(@Req() request: Request, @Body() dto: SendPasswordResetOtpDto): Promise<void> {
    this.requireOrigin(request);
    await this.sendOtp.execute(dto.email);
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify an OTP once and issue a five-minute reset token' })
  @ApiResponse({ status: 200, type: PasswordResetTokenResponseDto })
  async verify(
    @Req() request: Request,
    @Body() dto: VerifyPasswordResetOtpDto,
  ): Promise<PasswordResetTokenResponseDto> {
    this.requireOrigin(request);
    return this.verifyOtp.execute(dto.email, dto.otp);
  }

  @Post('reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Change the local BKPractice password once and revoke all sessions' })
  @ApiResponse({ status: 204 })
  async change(@Req() request: Request, @Body() dto: ResetPasswordWithGrantDto): Promise<void> {
    this.requireOrigin(request);
    await this.reset.execute(dto.resetToken, dto.newPassword);
  }

  private requireOrigin(request: Request): void {
    if (request.header('x-client-type') === 'mobile') return;
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
}
