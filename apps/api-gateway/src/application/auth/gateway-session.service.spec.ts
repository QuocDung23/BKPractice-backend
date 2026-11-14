import type { IdentitySessionClient } from '@gateway/infrastructure/identity/identity-session.client';

import { GatewaySessionService } from './gateway-session.service';

describe('GatewaySessionService', () => {
  it('maps session states and fails closed when Identity is unavailable', async () => {
    const sessions = { checkSession: jest.fn() } as unknown as IdentitySessionClient;
    const service = new GatewaySessionService(sessions);

    jest.mocked(sessions.checkSession).mockResolvedValueOnce('active');
    await expect(service.isActive('access')).resolves.toBe(true);
    jest.mocked(sessions.checkSession).mockResolvedValueOnce('inactive');
    await expect(service.isActive('access')).resolves.toBe(false);
    jest.mocked(sessions.checkSession).mockResolvedValueOnce('unavailable');
    await expect(service.isActive('access')).rejects.toMatchObject({
      status: 503,
      code: 'AUTH_SESSION_UNAVAILABLE',
      message: expect.stringContaining('dịch vụ Identity') as string,
    });
  });
});
