import { createSessionUnavailableError } from '@gateway/application/errors/gateway-errors';
import { IdentitySessionClient } from '@gateway/infrastructure/identity/identity-session.client';
import { Injectable } from '@nestjs/common';

@Injectable()
export class GatewaySessionService {
  constructor(private readonly sessions: IdentitySessionClient) {}

  async isActive(accessToken: string): Promise<boolean> {
    const state = await this.sessions.checkSession(accessToken);
    if (state === 'unavailable') {
      throw createSessionUnavailableError();
    }
    return state === 'active';
  }
}
