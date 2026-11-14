import { AppHttpException } from '@app/common';
import type { GetSubmissionDetailUseCase } from '@submission/modules/submissions/application/get-submission-detail.use-case';
import type { ListSubmissionHistoryUseCase } from '@submission/modules/submissions/application/list-submission-history.use-case';
import type { SubmitCodeUseCase } from '@submission/modules/submissions/application/submit-code.use-case';
import {
  JudgePackageUnavailableError,
  ProblemNotSubmittableError,
} from '@submission/modules/submissions/domain/ports/learning-judge-package.port';
import {
  SubmissionKind,
  SubmissionStatus,
} from '@submission/modules/submissions/domain/submission-record';

import { SubmissionsController } from './submissions.controller';

const OWNER_ID = '11111111-2222-4333-8444-555555555555';

function controllerWith(
  overrides: {
    listSubmissionHistory?: unknown;
    getSubmissionDetail?: unknown;
    submitCode?: unknown;
  } = {},
): SubmissionsController {
  return new SubmissionsController(
    (overrides.listSubmissionHistory ?? {}) as ListSubmissionHistoryUseCase,
    (overrides.getSubmissionDetail ?? {}) as GetSubmissionDetailUseCase,
    (overrides.submitCode ?? {}) as SubmitCodeUseCase,
  );
}

describe('SubmissionsController history', () => {
  const emptyPage = { items: [], total: 0, totalPages: 0, nextCursor: null };

  it('scopes the list to the trusted owner and passes a complete cursor through', async () => {
    const listSubmissionHistory = { execute: jest.fn().mockResolvedValue(emptyPage) };

    const page = await controllerWith({ listSubmissionHistory }).list(OWNER_ID, {
      kind: SubmissionKind.Submit,
      cursor: '2026-10-27T06:00:00.123456Z',
      cursorId: 'b6a0c1f2-3d4e-4f5a-8b9c-0d1e2f3a4b5c',
      limit: 50,
    });

    expect(listSubmissionHistory.execute).toHaveBeenCalledWith({
      ownerId: OWNER_ID,
      filter: { kind: SubmissionKind.Submit, problemId: undefined },
      cursor: {
        createdAt: '2026-10-27T06:00:00.123456Z',
        publicId: 'b6a0c1f2-3d4e-4f5a-8b9c-0d1e2f3a4b5c',
      },
      limit: 50,
    });
    expect(page).toEqual(emptyPage);
  });
});

const submitBody = {
  problemId: '6832170d-de82-41f7-a82c-57b71efbf55c',
  language: 'python' as const,
  sourceCode: 'print(1)',
};

describe('SubmissionsController detail', () => {
  it('maps both missing and foreign detail records to the same 404', async () => {
    const getSubmissionDetail = { execute: jest.fn().mockResolvedValue(null) };
    const controller = controllerWith({ getSubmissionDetail });

    const error: unknown = await controller
      .get(OWNER_ID, '93c160ad-dd5d-4c7f-a88a-c9c72d0ec4fd')
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AppHttpException);
    expect((error as AppHttpException).getStatus()).toBe(404);
    expect((error as AppHttpException).code).toBe('SUBMISSION_NOT_FOUND');
  });
});

describe('SubmissionsController Submit', () => {
  it('returns only the allow-listed acceptance fields with the owner from the trusted header', async () => {
    const acceptance = {
      id: 'b6a0c1f2-3d4e-4f5a-8b9c-0d1e2f3a4b5c',
      kind: SubmissionKind.Submit,
      status: SubmissionStatus.Queued,
      problemId: submitBody.problemId,
      language: 'python',
      createdAt: new Date('2026-10-27T06:00:00.000Z'),
    };
    const submitCode = { execute: jest.fn().mockResolvedValue(acceptance) };

    const result = await controllerWith({ submitCode }).submit(OWNER_ID, submitBody);

    expect(submitCode.execute).toHaveBeenCalledWith({ userId: OWNER_ID, ...submitBody });
    expect(result).toEqual({ ...acceptance, createdAt: '2026-10-27T06:00:00.000Z' });
    expect(Object.keys(result).sort()).toEqual(
      ['id', 'kind', 'status', 'problemId', 'language', 'createdAt'].sort(),
    );
  });

  it.each([
    [new ProblemNotSubmittableError(), 404, 'SUBMISSION_PROBLEM_NOT_SUBMITTABLE'],
    [new JudgePackageUnavailableError(), 503, 'SUBMISSION_JUDGE_PACKAGE_UNAVAILABLE'],
  ])('maps %p to its HTTP error', async (cause, status, code) => {
    const submitCode = { execute: jest.fn().mockRejectedValue(cause) };

    const error: unknown = await controllerWith({ submitCode })
      .submit(OWNER_ID, submitBody)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AppHttpException);
    expect((error as AppHttpException).getStatus()).toBe(status);
    expect((error as AppHttpException).code).toBe(code);
  });
});
