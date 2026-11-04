import type { RabbitMqService } from '@app/common';
import { Logger } from '@nestjs/common';
import type { ApplyRunJudgeResultUseCase } from '@submission/modules/submissions/application/apply-run-judge-result.use-case';
import type { ApplySubmitJudgeResultUseCase } from '@submission/modules/submissions/application/apply-submit-judge-result.use-case';

import { JudgeResultConsumer } from './judge-result.consumer';

const result = {
  executionId: 'b0d7c1de-7a4f-4b1d-9a7e-0f3b8f6f1a10',
  submissionId: '9f1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d',
  status: 'ACCEPTED',
};

function setup() {
  const applyRunResult = { execute: jest.fn().mockResolvedValue({ outcome: 'applied' }) };
  const applySubmitResult = { execute: jest.fn().mockResolvedValue({ outcome: 'applied' }) };
  const consumer = new JudgeResultConsumer(
    {} as RabbitMqService,
    applyRunResult as unknown as ApplyRunJudgeResultUseCase,
    applySubmitResult as unknown as ApplySubmitJudgeResultUseCase,
  );
  return { applyRunResult, applySubmitResult, consumer };
}

describe('JudgeResultConsumer', () => {
  it('hands a Submit result to the Submit use case only', async () => {
    const { applyRunResult, applySubmitResult, consumer } = setup();

    await consumer.handleResult({ ...result, mode: 'SUBMIT' });

    expect(applySubmitResult.execute).toHaveBeenCalledWith({ ...result, mode: 'SUBMIT' });
    expect(applyRunResult.execute).not.toHaveBeenCalled();
  });

  it('hands a Run result to the Run use case only', async () => {
    const { applyRunResult, applySubmitResult, consumer } = setup();

    await consumer.handleResult({ ...result, mode: 'RUN' });

    expect(applyRunResult.execute).toHaveBeenCalledTimes(1);
    expect(applySubmitResult.execute).not.toHaveBeenCalled();
  });

  it('throws on a malformed payload so the delivery is not acknowledged', async () => {
    const { applyRunResult, applySubmitResult, consumer } = setup();

    await expect(
      consumer.handleResult({ ...result, mode: 'SUBMIT', status: 'EXECUTED' }),
    ).rejects.toThrow('Malformed judge result');
    expect(applyRunResult.execute).not.toHaveBeenCalled();
    expect(applySubmitResult.execute).not.toHaveBeenCalled();
  });

  it('logs a warning when a Run result names an unknown submission', async () => {
    const { applyRunResult, consumer } = setup();
    applyRunResult.execute.mockResolvedValue({ outcome: 'ignored', reason: 'not-found' });
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    await consumer.handleResult({ ...result, mode: 'RUN' });

    expect(warn).toHaveBeenCalledWith('Ignored RUN judge result: not-found');
    warn.mockRestore();
  });

  it('propagates a rejected result so RabbitMQ retries and dead-letters it', async () => {
    const { applySubmitResult, consumer } = setup();
    applySubmitResult.execute.mockRejectedValue(new Error('unknown-submission'));

    await expect(consumer.handleResult({ ...result, mode: 'SUBMIT' })).rejects.toThrow(
      'unknown-submission',
    );
  });
});
