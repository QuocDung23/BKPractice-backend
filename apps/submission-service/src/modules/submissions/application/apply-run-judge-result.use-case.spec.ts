import type { RealtimePort } from '@submission/modules/submissions/domain/ports/realtime.port';
import type {
  PersistedSubmissionRecord,
  SubmissionRepositoryPort,
} from '@submission/modules/submissions/domain/ports/submission-repository.port';
import {
  SubmissionKind,
  SubmissionStatus,
} from '@submission/modules/submissions/domain/submission-record';

import { ApplyRunJudgeResultUseCase } from './apply-run-judge-result.use-case';

const run: PersistedSubmissionRecord = {
  id: '682bdd7d-8d75-4d87-b4e2-c2668e61b881',
  publicId: '9ba3668c-c18d-4c9b-9773-a4e67b583ba1',
  userId: 'cc202285-f526-453a-8bf4-62bd17367adf',
  problemId: null,
  kind: SubmissionKind.Run,
  language: 'cpp',
  sourceCode: 'int main() {}',
  stdin: '',
  status: SubmissionStatus.Queued,
  createdAt: new Date('2026-10-21T02:00:00.000Z'),
  updatedAt: new Date('2026-10-21T02:00:01.000Z'),
};

describe('ApplyRunJudgeResultUseCase', () => {
  it('maps ACCEPTED to EXECUTED and publishes one public-ID notification after persistence', async () => {
    const executed = { ...run, status: SubmissionStatus.Executed };
    const repository = {
      findById: jest.fn().mockResolvedValue(run),
      applyRunResultOnce: jest.fn().mockResolvedValue(executed),
    } as unknown as jest.Mocked<SubmissionRepositoryPort>;
    const realtime = {
      publishResult: jest.fn().mockResolvedValue(undefined),
    } as jest.Mocked<RealtimePort>;

    const outcome = await new ApplyRunJudgeResultUseCase(repository, realtime).execute({
      submissionId: run.id,
      mode: 'RUN',
      status: 'ACCEPTED',
      stdout: '42\n',
      runtimeMs: 10,
      memoryKb: 512,
    });

    expect(repository.applyRunResultOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        submissionId: run.id,
        status: SubmissionStatus.Executed,
        stdout: '42\n',
      }),
    );
    expect(realtime.publishResult).toHaveBeenCalledWith(run.userId, {
      submissionId: run.publicId,
      kind: SubmissionKind.Run,
      status: SubmissionStatus.Executed,
      ready: true,
    });
    expect(repository.applyRunResultOnce.mock.invocationCallOrder[0]).toBeLessThan(
      realtime.publishResult.mock.invocationCallOrder[0] ?? 0,
    );
    expect(outcome).toEqual({ outcome: 'applied' });
  });

  it.each([
    ['WRONG_ANSWER', 'wrong-answer'],
    ['ACCEPTED', 'mode-mismatch'],
  ] as const)('ignores invalid Run result %s when applicable', async (status, reason) => {
    const repository = {
      findById: jest.fn().mockResolvedValue(run),
      applyRunResultOnce: jest.fn(),
    } as unknown as jest.Mocked<SubmissionRepositoryPort>;
    const realtime = { publishResult: jest.fn() } as unknown as jest.Mocked<RealtimePort>;

    const outcome = await new ApplyRunJudgeResultUseCase(repository, realtime).execute({
      submissionId: run.id,
      mode: reason === 'mode-mismatch' ? 'SUBMIT' : 'RUN',
      status,
    });

    expect(outcome).toEqual({ outcome: 'ignored', reason });
    expect(repository.applyRunResultOnce).not.toHaveBeenCalled();
    expect(realtime.publishResult).not.toHaveBeenCalled();
  });

  it('does not publish for a duplicate, concurrent, or late terminal result', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(run),
      applyRunResultOnce: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<SubmissionRepositoryPort>;
    const realtime = { publishResult: jest.fn() } as unknown as jest.Mocked<RealtimePort>;

    const outcome = await new ApplyRunJudgeResultUseCase(repository, realtime).execute({
      submissionId: run.id,
      mode: 'RUN',
      status: 'RUNTIME_ERROR',
    });

    expect(outcome).toEqual({ outcome: 'ignored', reason: 'already-terminal' });
    expect(realtime.publishResult).not.toHaveBeenCalled();
  });

  it('ignores a result whose submission does not exist and publishes nothing', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(null),
      applyRunResultOnce: jest.fn(),
    } as unknown as jest.Mocked<SubmissionRepositoryPort>;
    const realtime = { publishResult: jest.fn() } as unknown as jest.Mocked<RealtimePort>;

    const outcome = await new ApplyRunJudgeResultUseCase(repository, realtime).execute({
      submissionId: run.id,
      mode: 'RUN',
      status: 'ACCEPTED',
    });

    expect(outcome).toEqual({ outcome: 'ignored', reason: 'not-found' });
    expect(repository.applyRunResultOnce).not.toHaveBeenCalled();
    expect(realtime.publishResult).not.toHaveBeenCalled();
  });
});
