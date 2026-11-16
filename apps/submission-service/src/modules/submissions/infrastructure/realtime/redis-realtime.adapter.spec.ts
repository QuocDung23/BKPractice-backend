import type { SubmissionRealtimeEnvelope } from '@app/contracts';
import type { SubmissionRealtimeNotification } from '@submission/modules/submissions/domain/ports/realtime.port';
import {
  SubmissionKind,
  SubmissionStatus,
} from '@submission/modules/submissions/domain/submission-record';

import type { RedisRealtimeClient, WarningLogger } from './redis-realtime.adapter';
import { RedisRealtimeAdapter } from './redis-realtime.adapter';

function client(): jest.Mocked<RedisRealtimeClient> {
  return {
    status: 'ready',
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockResolvedValue(1),
    quit: jest.fn().mockResolvedValue('OK'),
  };
}

describe('RedisRealtimeAdapter', () => {
  it('publishes only the minimal envelope and never writes a cache key', async () => {
    const redis = client();
    const adapter = new RedisRealtimeAdapter(redis, { warn: jest.fn() });

    await adapter.publishResult('06a82fce-42ae-49fd-8ac4-c379e8c8d67f', {
      submissionId: '4dde3cb8-916e-48e6-9cbd-9c10d58f07cf',
      kind: SubmissionKind.Run,
      status: SubmissionStatus.Executed,
      ready: true,
    });

    const message = redis.publish.mock.calls[0]?.[1];
    expect(JSON.parse(message ?? '') as SubmissionRealtimeEnvelope).toEqual({
      userId: '06a82fce-42ae-49fd-8ac4-c379e8c8d67f',
      notification: {
        submissionId: '4dde3cb8-916e-48e6-9cbd-9c10d58f07cf',
        kind: 'RUN',
        status: 'EXECUTED',
        ready: true,
      },
    });
    expect(redis).not.toHaveProperty('set');
  });

  it('swallows Redis errors and logs only one payload-free warning until recovery', async () => {
    const redis = client();
    redis.publish.mockRejectedValue(new Error('secret payload marker'));
    const logger = { warn: jest.fn<void, [string]>() } satisfies jest.Mocked<WarningLogger>;
    const adapter = new RedisRealtimeAdapter(redis, logger);
    const notification: SubmissionRealtimeNotification = {
      submissionId: '4dde3cb8-916e-48e6-9cbd-9c10d58f07cf',
      kind: SubmissionKind.Run,
      status: SubmissionStatus.InternalError,
      ready: true,
    };

    await expect(adapter.publishResult('owner', notification)).resolves.toBeUndefined();
    await expect(adapter.publishResult('owner', notification)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0]?.[0]).not.toContain('owner');
    expect(logger.warn.mock.calls[0]?.[0]).not.toContain('secret payload marker');
  });

  it('handles Redis client error events with one payload-free warning', () => {
    const redis = client();
    const logger: jest.Mocked<WarningLogger> = { warn: jest.fn() };
    new RedisRealtimeAdapter(redis, logger);

    const handleError = redis.on.mock.calls.find(([event]) => event === 'error')?.[1];
    handleError?.(new Error('connect ECONNREFUSED redis://user:secret@host'));
    handleError?.(new Error('again'));

    expect(handleError).toBeDefined();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith('Redis realtime publisher unavailable');
  });
});
