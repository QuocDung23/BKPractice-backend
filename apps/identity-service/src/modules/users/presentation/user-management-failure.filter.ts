import { sendApiError } from '@app/common';
import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { Response } from 'express';

import { UserManagementFailure } from '@/modules/users/domain';
import { describeUserManagementFailure } from '@/modules/users/presentation/user-management-errors';
import type { UserAdminRequest } from '@/modules/users/presentation/user-management.controller';

@Catch(UserManagementFailure)
export class UserManagementFailureFilter implements ExceptionFilter {
  private readonly logger = new Logger(UserManagementFailureFilter.name);

  catch(error: UserManagementFailure, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<UserAdminRequest>();
    const described = describeUserManagementFailure(error);
    const body = sendApiError({ request, response: http.getResponse<Response>() }, described);
    this.logger.warn({
      operation: request.method,
      outcome: error.code,
      code: described.code,
      actorId: request.principal?.userId,
      requestId: body.requestId,
    });
  }
}
