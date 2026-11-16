import { REDIS_CHANNELS } from '@app/contracts';
import type { SubmissionRealtimeEnvelope } from '@app/contracts';
import type {
  RealtimePort,
  SubmissionRealtimeNotification,
} from '@submission/modules/submissions/domain/ports/realtime.port';

export interface RedisRealtimeClient {
  readonly status: string;
  on(event: 'error', listener: (error: unknown) => void): unknown;
  connect(): Promise<unknown>;
  publish(channel: string, message: string): Promise<unknown>;
  quit(): Promise<unknown>;
}

export interface WarningLogger {
  warn(message: string): void;
}

export class RedisRealtimeAdapter implements RealtimePort {
  private unavailableLogged = false;

  constructor(
    private readonly redis: RedisRealtimeClient,
    private readonly logger: WarningLogger,
  ) {
    this.redis.on('error', () => this.logUnavailable());
  }

  async publishResult(
    ownerId: string,
    notification: SubmissionRealtimeNotification,
  ): Promise<void> {
    try {
      if (this.redis.status === 'wait') await this.redis.connect();
      const envelope = {
        userId: ownerId,
        notification,
      } satisfies SubmissionRealtimeEnvelope;
      await this.redis.publish(REDIS_CHANNELS.submissionResults, JSON.stringify(envelope));
      this.unavailableLogged = false;
    } catch {
      this.logUnavailable();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.redis.status !== 'end') await this.redis.quit();
  }

  private logUnavailable(): void {
    if (this.unavailableLogged) return;
    this.unavailableLogged = true;
    this.logger.warn('Redis realtime publisher unavailable');
  }
}
