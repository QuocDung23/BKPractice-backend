import { randomUUID } from 'node:crypto';

import { RABBIT_EXCHANGES, RABBIT_QUEUES, RABBIT_ROUTING_KEYS } from '@app/contracts';
import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqplib';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';

interface PublishOptions {
  messageId?: string;
  headers?: Record<string, unknown>;
}

interface QueueBinding {
  queue: string;
  exchange: string;
  routingKey: string;
  deadQueue: string;
  deadRoutingKey: string;
}

interface Consumer {
  queue: string;
  handler: (payload: unknown) => Promise<void>;
}

export const RABBIT_RECONNECT_INITIAL_DELAY_MS = 1_000;
export const RABBIT_RECONNECT_MAX_DELAY_MS = 30_000;

const bindings: QueueBinding[] = [
  {
    queue: RABBIT_QUEUES.judgeRequests,
    exchange: RABBIT_EXCHANGES.judge,
    routingKey: RABBIT_ROUTING_KEYS.judgeRequest,
    deadQueue: RABBIT_QUEUES.judgeRequestsDead,
    deadRoutingKey: RABBIT_ROUTING_KEYS.judgeRequestDead,
  },
  {
    queue: RABBIT_QUEUES.submissionResults,
    exchange: RABBIT_EXCHANGES.submission,
    routingKey: RABBIT_ROUTING_KEYS.judgeResult,
    deadQueue: RABBIT_QUEUES.submissionResultsDead,
    deadRoutingKey: RABBIT_ROUTING_KEYS.judgeResultDead,
  },
  {
    queue: RABBIT_QUEUES.learningAccepted,
    exchange: RABBIT_EXCHANGES.learning,
    routingKey: RABBIT_ROUTING_KEYS.submissionAccepted,
    deadQueue: RABBIT_QUEUES.learningAcceptedDead,
    deadRoutingKey: RABBIT_ROUTING_KEYS.submissionAcceptedDead,
  },
];

@Injectable()
export class RabbitMqService implements OnApplicationShutdown {
  private readonly logger = new Logger(RabbitMqService.name);
  private connection?: amqp.ChannelModel;
  private channel?: ConfirmChannel;
  // Shared by concurrent callers so start-up opens exactly one connection.
  private opening?: Promise<ConfirmChannel>;
  private readonly consumers: Consumer[] = [];
  // Consumers registered on the current channel; cleared whenever that channel is lost.
  private readonly attached = new Set<Consumer>();
  private reconnectTimer?: NodeJS.Timeout;
  private reconnectDelayMs = RABBIT_RECONNECT_INITIAL_DELAY_MS;
  private shuttingDown = false;
  private readonly maxRetries = 3;

  constructor(private readonly config: ConfigService) {}

  async publish<T extends object>(
    exchange: string,
    routingKey: string,
    payload: T,
    options: PublishOptions = {},
  ): Promise<void> {
    const channel = await this.getChannel();
    channel.publish(exchange, routingKey, Buffer.from(JSON.stringify(payload)), {
      contentType: 'application/json',
      deliveryMode: 2,
      messageId: options.messageId ?? randomUUID(),
      timestamp: Date.now(),
      headers: options.headers,
    });
    await channel.waitForConfirms();
  }

  // A broker that is down at start-up does not crash the service: the consumer is kept and
  // attached as soon as a reconnect succeeds.
  async consume<T>(queue: string, handler: (payload: T) => Promise<void>): Promise<void> {
    const consumer: Consumer = {
      queue,
      handler: handler as (payload: unknown) => Promise<void>,
    };
    this.consumers.push(consumer);
    try {
      await this.attachConsumer(await this.getChannel(), consumer);
    } catch (error: unknown) {
      this.logger.warn(`RabbitMQ unavailable for queue ${queue}: ${describe(error)}`);
      this.scheduleReconnect();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.shuttingDown = true;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    const { channel, connection } = this;
    this.channel = undefined;
    this.connection = undefined;
    await channel?.close().catch(() => undefined);
    await connection?.close().catch(() => undefined);
  }

  private getChannel(): Promise<ConfirmChannel> {
    if (this.channel) return Promise.resolve(this.channel);
    this.opening ??= this.openChannel().finally(() => {
      this.opening = undefined;
    });
    return this.opening;
  }

  private async openChannel(): Promise<ConfirmChannel> {
    if (this.shuttingDown) throw new Error('RabbitMQ service is shutting down');

    const connection = await amqp.connect(this.config.getOrThrow<string>('RABBITMQ_URL'));
    connection.on('error', (error: Error) => this.logger.error(error.message));
    connection.on('close', () => this.handleConnectionLost(connection));
    try {
      if (this.shuttingDown) throw new Error('RabbitMQ service is shutting down');
      const channel = await connection.createConfirmChannel();
      channel.on('error', (error: Error) => this.logger.error(error.message));
      channel.on('close', () => this.handleConnectionLost(connection));
      await channel.prefetch(1);
      await this.assertTopology(channel);
      if (this.shuttingDown) throw new Error('RabbitMQ service is shutting down');
      this.connection = connection;
      this.channel = channel;
      this.reconnectDelayMs = RABBIT_RECONNECT_INITIAL_DELAY_MS;
      return channel;
    } catch (error: unknown) {
      await connection.close().catch(() => undefined);
      throw error;
    }
  }

  private handleConnectionLost(connection: amqp.ChannelModel): void {
    if (this.connection !== connection) return;
    this.connection = undefined;
    this.channel = undefined;
    this.attached.clear();
    void connection.close().catch(() => undefined);
    if (this.shuttingDown) return;
    this.logger.warn('RabbitMQ connection lost; reconnecting');
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.shuttingDown) return;
    const delay = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(delay * 2, RABBIT_RECONNECT_MAX_DELAY_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.reconnect();
    }, delay);
    this.reconnectTimer.unref();
  }

  private async reconnect(): Promise<void> {
    try {
      const channel = await this.getChannel();
      await Promise.all(this.consumers.map((consumer) => this.attachConsumer(channel, consumer)));
      this.logger.log(`RabbitMQ reconnected; ${this.consumers.length} consumer(s) attached`);
    } catch (error: unknown) {
      this.logger.warn(`RabbitMQ reconnect failed: ${describe(error)}`);
      this.scheduleReconnect();
    }
  }

  private async attachConsumer(channel: ConfirmChannel, consumer: Consumer): Promise<void> {
    if (this.attached.has(consumer)) return;
    this.attached.add(consumer);
    try {
      await channel.consume(consumer.queue, (message) => {
        if (message) void this.handleMessage(channel, message, consumer.handler);
      });
    } catch (error: unknown) {
      this.attached.delete(consumer);
      throw error;
    }
    this.logger.log(`Consuming RabbitMQ queue ${consumer.queue}`);
  }

  // ACK/NACK must go to the channel that delivered the message. If that channel is gone, the
  // broker redelivers the unacknowledged message, and consumers are idempotent.
  private async handleMessage(
    channel: ConfirmChannel,
    message: ConsumeMessage,
    handler: (payload: unknown) => Promise<void>,
  ): Promise<void> {
    try {
      try {
        await handler(JSON.parse(message.content.toString('utf8')) as unknown);
        channel.ack(message);
      } catch (error: unknown) {
        const retries = Number(message.properties.headers?.['x-retry-count'] ?? 0);
        this.logger.error(`RabbitMQ handler failed (attempt ${retries + 1}): ${describe(error)}`);
        if (retries < this.maxRetries) {
          channel.publish(message.fields.exchange, message.fields.routingKey, message.content, {
            ...message.properties,
            headers: { ...message.properties.headers, 'x-retry-count': retries + 1 },
          });
          await channel.waitForConfirms();
          channel.ack(message);
        } else {
          channel.nack(message, false, false);
        }
      }
    } catch (error: unknown) {
      this.logger.warn(`RabbitMQ delivery left for redelivery: ${describe(error)}`);
      // A failed confirm can leave the delivering channel open with its only prefetch slot occupied.
      // Close that connection to release the unacknowledged delivery and reattach the consumers.
      if (this.channel === channel && this.connection) {
        this.handleConnectionLost(this.connection);
      }
    }
  }

  private async assertTopology(channel: ConfirmChannel): Promise<void> {
    await Promise.all([
      channel.assertExchange(RABBIT_EXCHANGES.judge, 'direct', { durable: true }),
      channel.assertExchange(RABBIT_EXCHANGES.submission, 'direct', { durable: true }),
      channel.assertExchange(RABBIT_EXCHANGES.learning, 'direct', { durable: true }),
      channel.assertExchange(RABBIT_EXCHANGES.deadLetter, 'direct', { durable: true }),
    ]);

    for (const binding of bindings) {
      await channel.assertQueue(binding.queue, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': RABBIT_EXCHANGES.deadLetter,
          'x-dead-letter-routing-key': binding.deadRoutingKey,
        },
      });
      await channel.bindQueue(binding.queue, binding.exchange, binding.routingKey);
      await channel.assertQueue(binding.deadQueue, { durable: true });
      await channel.bindQueue(
        binding.deadQueue,
        RABBIT_EXCHANGES.deadLetter,
        binding.deadRoutingKey,
      );
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
