import { timingSafeEqual } from 'node:crypto';

import { Controller, Get, Headers, Param, ParseUUIDPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';

import { UserManagementUseCases } from '@/modules/users/application';
import { USER_HTTP_ERRORS } from '@/modules/users/presentation/user-management-errors';

@ApiExcludeController()
@Controller('internal/users')
export class QuizShareRecipientController {
  constructor(
    private readonly users: UserManagementUseCases,
    private readonly config: ConfigService,
  ) {}
  @Get(':id/roles')
  async getRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-internal-service-secret') provided?: string,
  ) {
    const expected = this.config.get<string>('INTERNAL_SERVICE_SECRET');
    if (!expected) throw USER_HTTP_ERRORS.internalLookupUnavailable();
    const actual = Buffer.from(provided ?? '');
    const secret = Buffer.from(expected);
    if (actual.length !== secret.length || !timingSafeEqual(actual, secret))
      throw USER_HTTP_ERRORS.internalCredentialInvalid();
    const user = await this.users.getQuizShareRecipient(id.toLowerCase());
    if (!user) throw USER_HTTP_ERRORS.userNotFound();
    return user;
  }
}
