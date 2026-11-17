import type { RealtimePort } from '@submission/modules/submissions/domain/ports/realtime.port';
import type {
  PersistedSubmissionRecord,
  SubmissionRepositoryPort,
} from '@submission/modules/submissions/domain/ports/submission-repository.port';
import {
  SubmissionKind,
  SubmissionStatus,
} from '@submission/modules/submissions/domain/submission-record';

import {
  ApplySubmitJudgeResultUseCase,
  RejectedJudgeResultError,
} from './apply-submit-judge-result.use-case';

const now = new Date('2026-10-27T03:00:00.000Z');
const eventId = '3d1c8b0e-7b0e-4a0e-9f4f-6b8c2b9f0a01';

const submit: PersistedSubmissionRecord = {
  id: '9f1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d',
  publicId: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5e',
  userId: 'cc202285-f526-453a-8bf4-62bd17367adf',
  problemId: '6832170d-de82-41f7-a82c-57b71efbf55c',
  kind: SubmissionKind.Submit,
  language: 'python',
  sourceCode: 'print(1)',
  stdin: '',
  status: SubmissionStatus.Queued,
  createdAt: new Date('2026-10-27T02:59:00.000Z'),
  updatedAt: new Date('2026-10-27T02:59:00.000Z'),
};

function setup(record: PersistedSubmissionRecord | null = submit) {
  const repository = {
    findById: jest.fn().mockResolvedValue(record),
    applySubmitVerdictOnce: jest
      .fn()
      .mockImplementation(async () => record && { ...record, status: SubmissionStatus.Accepted }),
  } as unknown as jest.Mocked<SubmissionRepositoryPort>;
  const realtime = {
    publishResult: jest.fn().mockResolvedValue(undefined),
  } as jest.Mocked<RealtimePort>;
  const useCase = new ApplySubmitJudgeResultUseCase(
    repository,
    realtime,
    () => eventId,
    () => now,
  );
  return { repository, realtime, useCase };
}

describe('ApplySubmitJudgeResultUseCase', () => {
  it.each([[0], [undefined]])(
    'stores the Judge score %p as observed but queues the accepted event with score 100',
    async (score) => {
      const { repository, realtime, useCase } = setup();

      const outcome = await useCase.execute({
        submissionId: submit.id,
        status: 'ACCEPTED',
        score,
        passedTests: 3,
        totalTests: 3,
        stdout: 'ok',
      });

      expect(outcome).toEqual({ outcome: 'applied' });
      expect(repository.applySubmitVerdictOnce).toHaveBeenCalledWith({
        submissionId: submit.id,
        verdict: {
          status: SubmissionStatus.Accepted,
          score: score ?? null,
          passedTests: 3,
          totalTests: 3,
          runtimeMs: null,
          memoryKb: null,
        },
        stdout: 'ok',
        stderr: undefined,
        compileOutput: undefined,
        error: undefined,
        acceptedEvent: {
          eventId,
          occurredAt: now,
          submissionId: submit.id,
          userId: submit.userId,
          problemId: submit.problemId,
          score: 100,
        },
        now,
      });
      expect(realtime.publishResult).toHaveBeenCalledWith(submit.userId, {
        submissionId: submit.publicId,
        kind: SubmissionKind.Submit,
        status: SubmissionStatus.Accepted,
        ready: true,
      });
      expect(repository.applySubmitVerdictOnce.mock.invocationCallOrder[0]).toBeLessThan(
        realtime.publishResult.mock.invocationCallOrder[0] ?? 0,
      );
    },
  );

  it.each(['INTERNAL_ERROR', 'WRONG_ANSWER'])(
    'queues no accepted event for %s whatever the score',
    async (status) => {
      const { repository, useCase } = setup();

      await useCase.execute({ submissionId: submit.id, status, score: 100 });

      expect(repository.applySubmitVerdictOnce).toHaveBeenCalledWith(
        expect.objectContaining({ acceptedEvent: null }),
      );
    },
  );

  it('queues no accepted event for a Submit without a problem', async () => {
    const { repository, useCase } = setup({ ...submit, problemId: null });

    await useCase.execute({ submissionId: submit.id, status: 'ACCEPTED' });

    expect(repository.applySubmitVerdictOnce).toHaveBeenCalledWith(
      expect.objectContaining({ acceptedEvent: null }),
    );
  });

  it('ignores a redelivered result without writing or notifying', async () => {
    const { repository, realtime, useCase } = setup({
      ...submit,
      status: SubmissionStatus.Accepted,
    });

    const outcome = await useCase.execute({ submissionId: submit.id, status: 'WRONG_ANSWER' });

    expect(outcome).toEqual({ outcome: 'ignored', reason: 'already-terminal' });
    expect(repository.applySubmitVerdictOnce).not.toHaveBeenCalled();
    expect(realtime.publishResult).not.toHaveBeenCalled();
  });

  it('does not notify when a concurrent result won the conditional update', async () => {
    const { repository, realtime, useCase } = setup();
    repository.applySubmitVerdictOnce.mockResolvedValue(null);

    const outcome = await useCase.execute({ submissionId: submit.id, status: 'ACCEPTED' });

    expect(outcome).toEqual({ outcome: 'ignored', reason: 'already-terminal' });
    expect(realtime.publishResult).not.toHaveBeenCalled();
  });

  it('ignores a Submit result addressed to a Run', async () => {
    const { repository, useCase } = setup({ ...submit, kind: SubmissionKind.Run });

    const outcome = await useCase.execute({ submissionId: submit.id, status: 'ACCEPTED' });

    expect(outcome).toEqual({ outcome: 'ignored', reason: 'kind-mismatch' });
    expect(repository.applySubmitVerdictOnce).not.toHaveBeenCalled();
  });

  it('rejects an unknown submission so the delivery is dead-lettered', async () => {
    const { useCase } = setup(null);

    await expect(
      useCase.execute({ submissionId: submit.id, status: 'ACCEPTED' }),
    ).rejects.toMatchObject({ reason: 'unknown-submission' });
  });

  it('rejects a status outside the Submit verdicts before reading the record', async () => {
    const { repository, useCase } = setup();

    await expect(
      useCase.execute({ submissionId: submit.id, status: 'EXECUTED' }),
    ).rejects.toBeInstanceOf(RejectedJudgeResultError);
    expect(repository.findById).not.toHaveBeenCalled();
  });
});
