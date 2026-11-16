import { Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

import {
  AUTHORIZATION_PRINCIPAL_PROVIDER,
  type AuthorizationPrincipalProvider,
} from '@/modules/rbac/application';
import { requireAdmin, type AuthorizationPrincipal } from '@/modules/rbac/domain';
import { RBAC_HTTP_ERRORS } from '@/modules/rbac/presentation/rbac-errors';

export interface RbacRequest extends Request {
  principal: AuthorizationPrincipal;
}

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(
    @Inject(AUTHORIZATION_PRINCIPAL_PROVIDER)
    private readonly principals: AuthorizationPrincipalProvider,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RbacRequest>();
    const authorization = request.header('authorization');
    if (!authorization || !/^Bearer [^\s]+$/.test(authorization)) {
      throw RBAC_HTTP_ERRORS.bearerMissing();
    }
    request.principal = await this.principals.verifyAccess(authorization.slice(7));
    requireAdmin(request.principal);
    return true;
  }
}
