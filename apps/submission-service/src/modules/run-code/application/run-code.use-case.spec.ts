import type {
  JudgeJobPort,
  RunJudgeJob,
} from '@submission/modules/submissions/domain/ports/judge-job.port';
import type {
  PersistedSubmissionRecord,
  SubmissionRepositoryPort,
} from '@submission/modules/submissions/domain/ports/submission-repository.port';
import {
  SubmissionKind,
  SubmissionStatus,
} from '@submission/modules/submissions/domain/submission-record';

import { RunCodeUseCase } from './run-code.use-case';

const createdAt = new Date('2026-10-21T01:00:00.000Z');
const queuedAt = new Date('2026-10-21T01:00:01.000Z');

function persisted(status: SubmissionStatus = SubmissionStatus.Pending): PersistedSubmissionRecord {
  return {
    id: '7d8e158a-9115-4c46-a41e-ad142289c82f',
    publicId: '12f08ea2-da55-4ad8-85f3-cc771ea89ee3',
    userId: '244be499-2b2c-46af-bf17-36dbfd62f916',
    problemId: 'ddff26e3-c9e2-4cb5-9382-721fbf6e6011',
    kind: SubmissionKind.Run,
    language: 'python',
    sourceCode: 'print(input())',
    stdin: '',
    status,
    createdAt,
    updatedAt: status === SubmissionStatus.Pending ? createdAt : queuedAt,
  };
}

describe('RunCodeUseCase', () => {
  it('persists PENDING, publishes one fixed-limit job, then conditionally queues the Run', async () => {
    const saved = persisted();
    const queued = persisted(SubmissionStatus.Queued);
    const repository = {
      save: jest.fn().mockResolvedValue(saved),
      markQueued: jest.fn().mockResolvedValue(queued),
      markFailedToDispatch: jest.fn(),
    } as unknown as jest.Mocked<SubmissionRepositoryPort>;
    const judge = {
      publish: jest.fn().mockResolvedValue(undefined),
    } as jest.Mocked<JudgeJobPort>;
    const clock = jest.fn().mockReturnValueOnce(createdAt).mockReturnValueOnce(queuedAt);

    const result = await new RunCodeUseCase(repository, judge, clock).execute({
      userId: saved.userId,
      problemId: saved.problemId,
      language: 'python',
      sourceCode: saved.sourceCode,
      stdin: '',
    });

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: null,
        publicId: null,
        status: SubmissionStatus.Pending,
        stdin: '',
      }),
    );
    expect(judge.publish).toHaveBeenCalledTimes(1);
    expect(judge.publish).toHaveBeenCalledWith<Parameters<JudgeJobPort['publish']>>({
      submissionId: saved.id,
      kind: SubmissionKind.Run,
      language: 'python',
      sourceCode: saved.sourceCode,
      stdin: '',
      timeLimitMs: 3_000,
      memoryLimitMb: 256,
    } satisfies RunJudgeJob);
    expect(repository.markQueued).toHaveBeenCalledWith(saved.id, queuedAt);
    expect(result).toEqual({
      id: queued.publicId,
      kind: SubmissionKind.Run,
      status: SubmissionStatus.Queued,
      language: 'python',
      createdAt,
    });
  });

  it('still accepts the Run when a fast verdict moved it past PENDING before queueing', async () => {
    const saved = persisted();
    const repository = {
      save: jest.fn().mockResolvedValue(saved),
      markQueued: jest.fn().mockResolvedValue(null),
      markFailedToDispatch: jest.fn(),
    } as unknown as jest.Mocked<SubmissionRepositoryPort>;
    const judge = { publish: jest.fn().mockResolvedValue(undefined) };

    const result = await new RunCodeUseCase(repository, judge, () => queuedAt).execute({
      userId: saved.userId,
      language: 'python',
      sourceCode: saved.sourceCode,
      stdin: '',
    });

    expect(result).toMatchObject({ id: saved.publicId, status: SubmissionStatus.Queued });
    expect(repository.markFailedToDispatch).not.toHaveBeenCalled();
  });

  it('marks the pending record INTERNAL_ERROR and rethrows when Rabbit publish fails', async () => {
    const saved = persisted();
    const failure = new Error('broker unavailable');
    const repository = {
      save: jest.fn().mockResolvedValue(saved),
      markQueued: jest.fn(),
      markFailedToDispatch: jest.fn().mockResolvedValue(persisted(SubmissionStatus.InternalError)),
    } as unknown as jest.Mocked<SubmissionRepositoryPort>;
    const judge = { publish: jest.fn().mockRejectedValue(failure) };
    const failedAt = new Date('2026-10-21T01:00:02.000Z');
    const clock = jest.fn().mockReturnValueOnce(createdAt).mockReturnValueOnce(failedAt);

    await expect(
      new RunCodeUseCase(repository, judge, clock).execute({
        userId: saved.userId,
        language: 'python',
        sourceCode: saved.sourceCode,
        stdin: '',
      }),
    ).rejects.toBe(failure);

    expect(repository.markFailedToDispatch).toHaveBeenCalledWith(saved.id, failedAt);
    expect(repository.markQueued).not.toHaveBeenCalled();
  });
});
