import { AlreadySubmittedError } from '@submission/modules/submissions/domain/already-submitted.error';
import type { JudgeJobPort } from '@submission/modules/submissions/domain/ports/judge-job.port';
import { ProblemNotSubmittableError } from '@submission/modules/submissions/domain/ports/learning-judge-package.port';
import type {
  JudgePackage,
  LearningJudgePackagePort,
} from '@submission/modules/submissions/domain/ports/learning-judge-package.port';
import type {
  PersistedSubmissionRecord,
  SubmissionRepositoryPort,
} from '@submission/modules/submissions/domain/ports/submission-repository.port';
import {
  SubmissionKind,
  SubmissionStatus,
} from '@submission/modules/submissions/domain/submission-record';

import { SubmitCodeUseCase } from './submit-code.use-case';

const now = new Date('2026-10-27T06:00:00.000Z');
const input = {
  userId: 'cc202285-f526-453a-8bf4-62bd17367adf',
  problemId: '6832170d-de82-41f7-a82c-57b71efbf55c',
  language: 'python',
  sourceCode: 'print(1)',
};
const judgePackage: JudgePackage = {
  problemType: 'STANDARD',
  timeLimitMs: 2_000,
  memoryLimitMb: 128,
  testCases: [{ id: 'case-1', stdin: '1', expectedOutput: '1', score: 50 }],
};
const saved: PersistedSubmissionRecord = {
  id: '9f1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d',
  publicId: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5e',
  userId: input.userId,
  problemId: input.problemId,
  kind: SubmissionKind.Submit,
  language: 'python',
  sourceCode: 'print(1)',
  stdin: '',
  status: SubmissionStatus.Pending,
  createdAt: now,
  updatedAt: now,
};

function setup() {
  const learning = {
    getPackage: jest.fn().mockResolvedValue(judgePackage),
  } as jest.Mocked<LearningJudgePackagePort>;
  const repository = {
    getProblemSubmissionState: jest.fn().mockResolvedValue({ state: 'READY', submissionId: null }),
    saveOfficialSubmission: jest.fn().mockResolvedValue(saved),
    markQueued: jest.fn().mockResolvedValue({ ...saved, status: SubmissionStatus.Queued }),
    markFailedToDispatch: jest.fn().mockResolvedValue(null),
  } as unknown as jest.Mocked<SubmissionRepositoryPort>;
  const judge = { publish: jest.fn().mockResolvedValue(undefined) } as jest.Mocked<JudgeJobPort>;
  const useCase = new SubmitCodeUseCase(learning, repository, judge, () => now);
  return { learning, repository, judge, useCase };
}

describe('SubmitCodeUseCase', () => {
  it('saves a PENDING Submit, dispatches the Learning package, then queues it', async () => {
    const { learning, repository, judge, useCase } = setup();

    const acceptance = await useCase.execute(input);

    expect(learning.getPackage).toHaveBeenCalledWith(input.problemId, 'python');
    expect(repository.saveOfficialSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: SubmissionKind.Submit,
        status: SubmissionStatus.Pending,
        userId: input.userId,
        problemId: input.problemId,
      }),
    );
    expect(judge.publish).toHaveBeenCalledWith({
      submissionId: saved.id,
      kind: SubmissionKind.Submit,
      problemId: input.problemId,
      language: 'python',
      sourceCode: 'print(1)',
      judgePackage,
    });
    expect(repository.markQueued).toHaveBeenCalledWith(saved.id, now);
    expect(acceptance).toEqual({
      id: saved.publicId,
      kind: SubmissionKind.Submit,
      status: SubmissionStatus.Queued,
      problemId: input.problemId,
      language: 'python',
      createdAt: now,
    });
  });

  it('creates no record and no job when Learning refuses the package', async () => {
    const { learning, repository, judge, useCase } = setup();
    learning.getPackage.mockRejectedValue(new ProblemNotSubmittableError());

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(ProblemNotSubmittableError);
    expect(repository.saveOfficialSubmission).not.toHaveBeenCalled();
    expect(judge.publish).not.toHaveBeenCalled();
  });

  it.each(['JUDGING', 'SOLVED'] as const)(
    'rejects a submission while the problem is %s',
    async (state) => {
      const { learning, repository, judge, useCase } = setup();
      repository.getProblemSubmissionState.mockResolvedValue({
        state,
        submissionId: saved.publicId,
      });

      await expect(useCase.execute(input)).rejects.toMatchObject({ state });
      expect(repository.getProblemSubmissionState).toHaveBeenCalledWith(
        input.userId,
        input.problemId,
      );
      expect(learning.getPackage).not.toHaveBeenCalled();
      expect(repository.saveOfficialSubmission).not.toHaveBeenCalled();
      expect(judge.publish).not.toHaveBeenCalled();
    },
  );

  it('never publishes the request that loses a concurrent insert', async () => {
    const { repository, judge, useCase } = setup();
    repository.saveOfficialSubmission.mockRejectedValue(new AlreadySubmittedError());

    repository.getProblemSubmissionState
      .mockResolvedValueOnce({ state: 'READY', submissionId: null })
      .mockResolvedValueOnce({ state: 'SOLVED', submissionId: saved.publicId });

    await expect(useCase.execute(input)).rejects.toMatchObject({ state: 'SOLVED' });
    expect(judge.publish).not.toHaveBeenCalled();
  });

  it('accepts a new attempt even when a failed submission is already in the history', async () => {
    const { repository, judge, useCase } = setup();
    repository.getProblemSubmissionState.mockResolvedValue({
      state: 'READY',
      submissionId: 'previous-submission-id',
    });

    await expect(useCase.execute(input)).resolves.toMatchObject({ id: saved.publicId });
    expect(judge.publish).toHaveBeenCalledTimes(1);
  });

  it('ends the record as INTERNAL_ERROR instead of QUEUED when dispatch fails', async () => {
    const { repository, judge, useCase } = setup();
    judge.publish.mockRejectedValue(new Error('broker down'));

    await expect(useCase.execute(input)).rejects.toThrow('broker down');
    expect(repository.markFailedToDispatch).toHaveBeenCalledWith(saved.id, now);
    expect(repository.markQueued).not.toHaveBeenCalled();
  });

  it('still accepts the job when a fast verdict already moved the record past PENDING', async () => {
    const { repository, useCase } = setup();
    repository.markQueued.mockResolvedValue(null);

    await expect(useCase.execute(input)).resolves.toMatchObject({
      status: SubmissionStatus.Queued,
    });
  });
});
