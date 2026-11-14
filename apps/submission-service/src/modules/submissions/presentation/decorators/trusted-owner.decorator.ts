import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { Request } from 'express';

import { SUBMISSION_ERRORS, createSubmissionError } from '../submission-errors';

const USER_ID_HEADER = 'x-auth-user-id';

// The Gateway strips any client-sent x-auth-user-id and sets it from the verified access token.
export function readTrustedOwner(request: Request): string {
  const rawHeaders = request.rawHeaders ?? [];
  const values: string[] = [];

  for (let index = 0; index < rawHeaders.length; index += 2) {
    if (rawHeaders[index]?.toLowerCase() === USER_ID_HEADER) {
      values.push(rawHeaders[index + 1] ?? '');
    }
  }

  const [ownerId] = values;
  if (values.length !== 1 || ownerId === undefined || !isUUID(ownerId)) {
    throw createSubmissionError(SUBMISSION_ERRORS.userContextMissing);
  }

  return ownerId;
}

export const TrustedOwner = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string =>
    readTrustedOwner(context.switchToHttp().getRequest<Request>()),
);
