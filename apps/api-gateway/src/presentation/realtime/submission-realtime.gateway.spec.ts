import type { SubmissionRealtimeEnvelope } from '@app/contracts';
import type { GatewaySessionService } from '@gateway/application/auth/gateway-session.service';
import type { SubmissionResultsService } from '@gateway/application/realtime/submission-results.service';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';

import { SubmissionRealtimeGateway } from './submission-realtime.gateway';

describe('SubmissionRealtimeGateway authentication', () => {
  const jwt = new JwtService();
  const config = new ConfigService({
    REDIS_URL: 'redis://localhost:6379',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    CORS_ORIGINS: 'https://app.example',
  });
  const sessions = {
    isActive: jest.fn().mockResolvedValue(true),
  } as unknown as GatewaySessionService;
  const results = {
    subscribe: jest.fn(),
    reserveConnection: jest.fn().mockResolvedValue(true),
    releaseConnection: jest.fn().mockResolvedValue(undefined),
  } as unknown as SubmissionResultsService;
  const gateway = new SubmissionRealtimeGateway(jwt, config, sessions, results);

  function client(token: string | undefined, cookie?: string, origin?: string) {
    const join = jest.fn().mockResolvedValue(undefined);
    const disconnect = jest.fn();
    return {
      socket: {
        handshake: { auth: token === undefined ? {} : { token }, headers: { cookie, origin } },
        data: {},
        connected: true,
        once: jest.fn(),
        join,
        disconnect,
      } as unknown as Socket,
      join,
      disconnect,
    };
  }

  afterEach(() => gateway.onApplicationShutdown());

  it('accepts an access cookie from an allowed browser origin', async () => {
    const token = await jwt.signAsync(
      { sub: 'user-1', sid: 'session-1', jti: 'access-1', type: 'access' },
      { secret: 'a'.repeat(32), expiresIn: '15m' },
    );
    const connection = client(undefined, `__Host-bk_access=${token}`, 'https://app.example');
    await gateway.handleConnection(connection.socket);
    expect(connection.join).toHaveBeenCalledWith('user:user-1');
    expect(connection.disconnect).not.toHaveBeenCalled();
  });

  it('rejects a cookie from an untrusted origin and does not fall back from an invalid explicit token', async () => {
    const token = await jwt.signAsync(
      { sub: 'user-1', sid: 'session-1', jti: 'access-1', type: 'access' },
      { secret: 'a'.repeat(32), expiresIn: '15m' },
    );
    const wrongType = await jwt.signAsync(
      { sub: 'user-1', type: 'refresh' },
      { secret: 'a'.repeat(32), expiresIn: '15m' },
    );
    const expired = await jwt.signAsync(
      { sub: 'user-1', type: 'access', exp: 1 },
      { secret: 'a'.repeat(32) },
    );
    for (const connection of [
      client(undefined, `__Host-bk_access=${token}`, 'https://evil.example'),
      client(undefined, `__Host-bk_access=${wrongType}`, 'https://app.example'),
      client(undefined, `__Host-bk_access=${expired}`, 'https://app.example'),
      client('invalid', `__Host-bk_access=${token}`, 'https://app.example'),
    ]) {
      await gateway.handleConnection(connection.socket);
      expect(connection.disconnect).toHaveBeenCalledWith(true);
      expect(connection.join).not.toHaveBeenCalled();
    }
  });
});

describe('Submission realtime isolation and connection lifecycle', () => {
  const jwt = new JwtService();
  const secret = 'a'.repeat(32);
  let receive: (envelope: SubmissionRealtimeEnvelope) => void;
  const results = {
    subscribe: jest.fn((handler: typeof receive) => {
      receive = handler;
    }),
    reserveConnection: jest.fn().mockResolvedValue(true),
    releaseConnection: jest.fn().mockResolvedValue(undefined),
  };
  const sessions = { isActive: jest.fn().mockResolvedValue(true) };
  let gateway: SubmissionRealtimeGateway;
  function createClient(auth: Record<string, unknown>, query = {}) {
    return {
      handshake: { auth, query, headers: {} },
      data: {},
      connected: true,
      join: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn(),
      emit: jest.fn(),
    };
  }
  async function token(sub = 'owner', expiresIn = 60) {
    return jwt.signAsync(
      { sub, sid: 'session', jti: 'token', type: 'access' },
      { secret, expiresIn },
    );
  }
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.clearAllMocks();
    results.reserveConnection.mockResolvedValue(true);
    gateway = new SubmissionRealtimeGateway(
      jwt,
      new ConfigService({ JWT_ACCESS_SECRET: secret }),
      sessions as unknown as GatewaySessionService,
      results as unknown as SubmissionResultsService,
    );
  });
  afterEach(() => {
    gateway.onApplicationShutdown();
    jest.useRealTimers();
  });

  it.each(['owner', 'userId', 'role', 'permissions', 'room'])(
    'rejects client-selected %s from auth or query',
    async (key) => {
      for (const client of [
        createClient({ token: await token(), [key]: 'victim' }),
        createClient({ token: await token() }, { [key]: 'victim' }),
      ]) {
        await gateway.handleConnection(client as unknown as Socket);
        expect(client.disconnect).toHaveBeenCalledWith(true);
        expect(client.join).not.toHaveBeenCalled();
      }
      expect(results.reserveConnection).not.toHaveBeenCalled();
    },
  );
  it('forwards only to authenticated sockets of the envelope owner', async () => {
    const owner = createClient({ token: await token() });
    const other = createClient({ token: await token('other') });
    await gateway.handleConnection(owner as unknown as Socket);
    await gateway.handleConnection(other as unknown as Socket);
    const notification = {
      submissionId: 'id',
      kind: 'SUBMIT',
      status: 'ACCEPTED',
      ready: true,
    } as const;
    receive({ userId: 'owner', notification });
    await jest.advanceTimersByTimeAsync(0);
    expect(owner.emit).toHaveBeenCalledWith('submission.result', notification);
    expect(other.emit).not.toHaveBeenCalled();
  });

  it('delivers one notification to every open session of the same learner', async () => {
    const sessions = [
      createClient({ token: await token() }),
      createClient({ token: await token() }),
    ];
    const other = createClient({ token: await token('other') });
    for (const client of [...sessions, other])
      await gateway.handleConnection(client as unknown as Socket);
    const notification = {
      submissionId: 'id',
      kind: 'RUN',
      status: 'EXECUTED',
      ready: true,
    } as const;
    receive({ userId: 'owner', notification });
    await jest.advanceTimersByTimeAsync(0);
    for (const client of sessions) {
      expect(client.emit).toHaveBeenCalledTimes(1);
      expect(client.emit).toHaveBeenCalledWith('submission.result', notification);
    }
    expect(other.emit).not.toHaveBeenCalled();
  });
  it('closes at expiry even without a result and releases its lease', async () => {
    const client = createClient({ token: await token('owner', 1) });
    await gateway.handleConnection(client as unknown as Socket);
    await jest.advanceTimersByTimeAsync(1000);
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(results.releaseConnection).toHaveBeenCalledWith('owner', expect.any(String));
    receive({
      userId: 'owner',
      notification: { submissionId: 'id', kind: 'RUN', status: 'EXECUTED', ready: true },
    });
    await jest.advanceTimersByTimeAsync(0);
    expect(client.emit).not.toHaveBeenCalled();
  });
  it('accepts five sockets, rejects a denied sixth lease, and releases disconnected slots', async () => {
    const clients = [];
    for (let i = 0; i < 5; i++) {
      const client = createClient({ token: await token() });
      clients.push(client);
      await gateway.handleConnection(client as unknown as Socket);
      expect(client.join).toHaveBeenCalledWith('user:owner');
    }
    results.reserveConnection.mockResolvedValueOnce(false);
    const denied = createClient({ token: await token() });
    await gateway.handleConnection(denied as unknown as Socket);
    expect(denied.disconnect).toHaveBeenCalledWith(true);
    expect(denied.join).not.toHaveBeenCalled();
    gateway.handleDisconnect(clients[0] as unknown as Socket);
    expect(results.releaseConnection).toHaveBeenCalledWith('owner', expect.any(String));
    const replacement = createClient({ token: await token() });
    await gateway.handleConnection(replacement as unknown as Socket);
    expect(replacement.join).toHaveBeenCalledWith('user:owner');
  });
  it('closes an existing socket if its distributed lease cannot be renewed', async () => {
    const client = createClient({ token: await token() });
    await gateway.handleConnection(client as unknown as Socket);
    results.reserveConnection.mockResolvedValue(false);
    await jest.advanceTimersByTimeAsync(10_000);
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(results.releaseConnection).toHaveBeenCalled();
  });
});
