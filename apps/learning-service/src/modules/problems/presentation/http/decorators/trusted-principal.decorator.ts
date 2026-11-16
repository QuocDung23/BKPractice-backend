import { UnauthorizedError } from '@learning/modules/problems/application/errors/unauthorized.error';
import type { Principal } from '@learning/modules/problems/application/models/principal';
import type { ExecutionContext } from '@nestjs/common';
import { createParamDecorator } from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { Request } from 'express';

const USER_ID_HEADER = 'x-auth-user-id';
const ROLES_HEADER = 'x-auth-roles';
const PERMISSIONS_HEADER = 'x-auth-permissions';
const MAX_ROLES = 50;
const MAX_PERMISSIONS = 200;
const ROLE_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const PERMISSION_PATTERN = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/;

export function readTrustedPrincipal(request: Request): Principal {
  const rawHeaders = request.rawHeaders ?? [];
  const userId = readSingleHeader(rawHeaders, USER_ID_HEADER);

  if (userId === undefined || !isUUID(userId)) {
    throw new UnauthorizedError();
  }

  const roles = parseList(readSingleHeader(rawHeaders, ROLES_HEADER), MAX_ROLES, ROLE_PATTERN);
  const permissions = parseList(
    readSingleHeader(rawHeaders, PERMISSIONS_HEADER),
    MAX_PERMISSIONS,
    PERMISSION_PATTERN,
  );

  return { userId: userId.toLowerCase(), roles, permissions };
}

export const TrustedPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal =>
    readTrustedPrincipal(context.switchToHttp().getRequest<Request>()),
);

function readSingleHeader(rawHeaders: readonly string[], name: string): string | undefined {
  const values: string[] = [];

  for (let index = 0; index < rawHeaders.length; index += 2) {
    if (rawHeaders[index]?.toLowerCase() === name) {
      values.push(rawHeaders[index + 1] ?? '');
    }
  }

  if (values.length > 1) {
    throw new UnauthorizedError();
  }

  return values[0];
}

function parseList(
  rawValue: string | undefined,
  maxLength: number,
  pattern: RegExp,
): readonly string[] {
  if (rawValue === undefined) {
    return [];
  }

  const values = rawValue
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const uniqueValues = [...new Set(values)];

  if (uniqueValues.length > maxLength || uniqueValues.some((value) => !pattern.test(value))) {
    throw new UnauthorizedError();
  }

  return uniqueValues;
}
