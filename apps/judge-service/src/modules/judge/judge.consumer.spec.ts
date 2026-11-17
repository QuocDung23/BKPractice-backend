import type { RabbitMqService } from '@app/common';
import { RABBIT_EXCHANGES, RABBIT_QUEUES, RABBIT_ROUTING_KEYS } from '@app/contracts';
import type { JudgeResult } from '@app/contracts';
import { Logger } from '@nestjs/common';

import type { ProcessJudgeRequestUseCase } from './application/process-judge-request.use-case';
import { JudgeConsumer } from './judge.consumer';

const result: JudgeResult = {
  executionId: 'exec-1',
  submissionId: 'sub-1',
  mode: 'RUN',
  status: 'ACCEPTED',
};

describe('JudgeConsumer', () => {
  const rabbit = {
    consume: jest.fn<Promise<void>, [string, (payload: unknown) => Promise<void>]>(),
    publish: jest.fn(),
  };
  const useCase = { execute: jest.fn() };
  let handle: (payload: unknown) => Promise<void>;

  beforeEach(async () => {
    jest.clearAllMocks();
    rabbit.consume.mockResolvedValue(undefined);
    rabbit.publish.mockResolvedValue(undefined);
    await new JudgeConsumer(
      rabbit as unknown as RabbitMqService,
      useCase as unknown as ProcessJudgeRequestUseCase,
    ).onModuleInit();
    expect(rabbit.consume).toHaveBeenCalledWith(RABBIT_QUEUES.judgeRequests, expect.any(Function));
    handle = rabbit.consume.mock.calls[0]![1];
  });

  it('publishes the result with the execution id as message id', async () => {
    useCase.execute.mockResolvedValue(result);
    await handle({ any: 'payload' });
    expect(rabbit.publish).toHaveBeenCalledWith(
      RABBIT_EXCHANGES.submission,
      RABBIT_ROUTING_KEYS.judgeResult,
      result,
      { messageId: 'exec-1' },
    );
  });

  it('fails the handler when publishing fails so the request is not acknowledged', async () => {
    useCase.execute.mockResolvedValue(result);
    rabbit.publish.mockRejectedValue(new Error('broker down'));
    await expect(handle({})).rejects.toThrow('broker down');
  });

  it('drops an uncorrelatable message with a payload-free warning and no publish', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    useCase.execute.mockResolvedValue(undefined);
    await expect(handle({ sourceCode: 'secret-source' })).resolves.toBeUndefined();
    expect(rabbit.publish).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-source');
    warn.mockRestore();
  });
});
