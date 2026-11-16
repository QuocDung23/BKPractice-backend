import { sendApiError } from '@app/common';
import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

import { RbacFailure } from '@/modules/rbac/domain';
import { describeRbacFailure } from '@/modules/rbac/presentation/rbac-errors';

@Catch(RbacFailure)
export class RbacFailureFilter implements ExceptionFilter {
  private readonly logger = new Logger(RbacFailureFilter.name);

  catch(error: RbacFailure, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const described = describeRbacFailure(error);
    const body = sendApiError({ request, response: http.getResponse<Response>() }, described);
    this.logger.warn({
      operation: request.method,
      outcome: error.code,
      code: described.code,
      requestId: body.requestId,
    });
  }
}
