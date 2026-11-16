import { sendApiError } from '@app/common';
import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

import { ProfileFailure } from '@/modules/profiles/domain';
import { describeProfileFailure } from '@/modules/profiles/presentation/profile-errors';
import { RbacFailure } from '@/modules/rbac/domain';

@Catch(ProfileFailure, RbacFailure)
export class ProfileFailureFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProfileFailureFilter.name);

  catch(error: ProfileFailure | RbacFailure, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const described = describeProfileFailure(error);
    const body = sendApiError({ request, response: http.getResponse<Response>() }, described);
    this.logger.warn({
      operation: request.method,
      outcome: error.code,
      code: described.code,
      requestId: body.requestId,
    });
  }
}
