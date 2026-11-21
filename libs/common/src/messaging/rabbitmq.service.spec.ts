import { EventEmitter } from 'node:events';

import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import amqp from 'amqplib';
import type { ConsumeMessage } from 'amqplib';

import {
  RABBIT_RECONNECT_INITIAL_DELAY_MS,
  RABBIT_RECONNECT_MAX_DELAY_MS,
  RabbitMqService,
} from './rabbitmq.service';

jest.mock('amqplib', () => ({ __esModule: true, default: { connect: jest.fn() } }));

class FakeChannel extends EventEmitter {
  prefetch = jest.fn().mockResolvedValue(undefined);
  assertExchange = jest.fn().mockResolvedValue(undefined);
  assertQueue = jest.fn().mockResolvedValue(undefined);
  bindQueue = jest.fn().mockResolvedValue(undefined);
  consume = jest.fn().mockResolvedValue({ consumerTag: 'tag' });
  publish = jest.fn().mockReturnValue(true);
  waitForConfirms = jest.fn().mockResolvedValue(undefined);
  ack = jest.fn();
  nack = jest.fn();
  close = jest.fn().mockResolvedValue(undefined);
}

class FakeConnection extends EventEmitter {
  readonly channel = new FakeChannel();
  createConfirmChannel = jest.fn(() => Promise.resolve(this.channel));
  close = jest.fn().mockResolvedValue(undefined);
}

const connect = amqp.connect as unknown as jest.Mock;
const config = { getOrThrow: () => 'amqp://localhost' } as unknown as ConfigService;

function message(body: unknown, retries = 0): ConsumeMessage {
  return {
    content: Buffer.from(JSON.stringify(body)),
    fields: { exchange: 'bkpractice.submission', routingKey: 'judge.result' },
    properties: { headers: { 'x-retry-count': retries } },
  } as unknown as ConsumeMessage;
}

function deliveryCallback(channel: FakeChannel): (value: ConsumeMessage) => void {
  const [, onMessage] = channel.consume.mock.calls[0] as [string, (value: ConsumeMessage) => void];
  return onMessage;
}

describe('RabbitMqService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    connect.mockReset();
    for (const method of ['log', 'warn', 'error'] as const) {
      jest.spyOn(Logger.prototype, method).mockImplementation(() => undefined);
    }
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('opens a single connection for concurrent first callers', async () => {
    const connection = new FakeConnection();
    connect.mockResolvedValue(connection);
    const rabbit = new RabbitMqService(config);

    await Promise.all([
      rabbit.consume('submission.results', jest.fn()),
      rabbit.publish('bkpractice.judge', 'judge.request', { id: 1 }),
      rabbit.publish('bkpractice.judge', 'judge.request', { id: 2 }),
    ]);

    expect(connect).toHaveBeenCalledTimes(1);
    expect(connection.createConfirmChannel).toHaveBeenCalledTimes(1);
    expect(connection.channel.consume).toHaveBeenCalledTimes(1);
  });

  it('reconnects after the connection closes and re-attaches every consumer', async () => {
    const first = new FakeConnection();
    const second = new FakeConnection();
    connect.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const rabbit = new RabbitMqService(config);
    await rabbit.consume('submission.results', jest.fn());
    await rabbit.consume('learning.submission.accepted', jest.fn());

    first.emit('close');
    await jest.advanceTimersByTimeAsync(RABBIT_RECONNECT_INITIAL_DELAY_MS);

    expect(connect).toHaveBeenCalledTimes(2);
    expect(second.channel.assertExchange).toHaveBeenCalled();
    expect(second.channel.consume.mock.calls.map(([queue]) => queue as string)).toEqual([
      'submission.results',
      'learning.submission.accepted',
    ]);
  });

  it('backs off between failed reconnect attempts', async () => {
    const first = new FakeConnection();
    const recovered = new FakeConnection();
    connect
      .mockResolvedValueOnce(first)
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce(recovered);
    const rabbit = new RabbitMqService(config);
    await rabbit.consume('judge.requests', jest.fn());

    first.emit('close');
    await jest.advanceTimersByTimeAsync(RABBIT_RECONNECT_INITIAL_DELAY_MS);
    expect(connect).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(RABBIT_RECONNECT_INITIAL_DELAY_MS);
    expect(connect).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(RABBIT_RECONNECT_INITIAL_DELAY_MS);
    expect(connect).toHaveBeenCalledTimes(3);
    expect(recovered.channel.consume).toHaveBeenCalledWith('judge.requests', expect.any(Function));
  });

  it('keeps a consumer registered when the broker is down at start-up', async () => {
    const connection = new FakeConnection();
    connect.mockRejectedValueOnce(new Error('ECONNREFUSED')).mockResolvedValueOnce(connection);
    const rabbit = new RabbitMqService(config);

    await expect(rabbit.consume('judge.requests', jest.fn())).resolves.toBeUndefined();
    await jest.advanceTimersByTimeAsync(RABBIT_RECONNECT_INITIAL_DELAY_MS);

    expect(connection.channel.consume).toHaveBeenCalledWith('judge.requests', expect.any(Function));
  });

  it('does not reconnect once the application is shutting down', async () => {
    const connection = new FakeConnection();
    connect.mockResolvedValue(connection);
    const rabbit = new RabbitMqService(config);
    await rabbit.consume('judge.requests', jest.fn());

    await rabbit.onApplicationShutdown();
    connection.emit('close');
    await jest.advanceTimersByTimeAsync(RABBIT_RECONNECT_MAX_DELAY_MS * 2);

    expect(connect).toHaveBeenCalledTimes(1);
    expect(connection.close).toHaveBeenCalled();
  });

  it('closes a connection that finishes opening after shutdown', async () => {
    const connection = new FakeConnection();
    let completeConnect!: (connection: FakeConnection) => void;
    connect.mockReturnValueOnce(
      new Promise<FakeConnection>((resolve) => {
        completeConnect = resolve;
      }),
    );
    const rabbit = new RabbitMqService(config);
    const start = rabbit.consume('judge.requests', jest.fn());

    await rabbit.onApplicationShutdown();
    completeConnect(connection);
    await start;
    await jest.advanceTimersByTimeAsync(RABBIT_RECONNECT_MAX_DELAY_MS);

    expect(connection.close).toHaveBeenCalledTimes(1);
    expect(connection.channel.consume).not.toHaveBeenCalled();
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('reconnects when republishing fails to confirm on an open channel', async () => {
    const first = new FakeConnection();
    const recovered = new FakeConnection();
    connect.mockResolvedValueOnce(first).mockResolvedValueOnce(recovered);
    first.channel.waitForConfirms.mockRejectedValueOnce(new Error('message nacked'));
    const handler = jest.fn().mockRejectedValueOnce(new Error('temporary failure'));
    const rabbit = new RabbitMqService(config);
    await rabbit.consume('judge.requests', handler);

    const delivered = message({ id: 'pending' });
    deliveryCallback(first.channel)(delivered);
    await jest.advanceTimersByTimeAsync(RABBIT_RECONNECT_INITIAL_DELAY_MS);

    expect(first.close).toHaveBeenCalledTimes(1);
    expect(first.channel.ack).not.toHaveBeenCalled();
    deliveryCallback(recovered.channel)(delivered);
    await jest.advanceTimersByTimeAsync(0);
    expect(recovered.channel.ack).toHaveBeenCalledWith(delivered);
  });

  it('acknowledges a handled message on the channel that delivered it', async () => {
    const connection = new FakeConnection();
    connect.mockResolvedValue(connection);
    const handler = jest.fn().mockResolvedValue(undefined);
    const rabbit = new RabbitMqService(config);
    await rabbit.consume('submission.results', handler);

    const delivered = message({ submissionId: 'abc' });
    deliveryCallback(connection.channel)(delivered);
    await jest.advanceTimersByTimeAsync(0);

    expect(handler).toHaveBeenCalledWith({ submissionId: 'abc' });
    expect(connection.channel.ack).toHaveBeenCalledWith(delivered);
  });

  it('dead-letters a message that still fails after the maximum retries', async () => {
    const connection = new FakeConnection();
    connect.mockResolvedValue(connection);
    const rabbit = new RabbitMqService(config);
    await rabbit.consume('submission.results', jest.fn().mockRejectedValue(new Error('boom')));

    const delivered = message({}, 3);
    deliveryCallback(connection.channel)(delivered);
    await jest.advanceTimersByTimeAsync(0);

    expect(connection.channel.nack).toHaveBeenCalledWith(delivered, false, false);
    expect(connection.channel.publish).not.toHaveBeenCalled();
  });
});
