import type { JudgeRequest, JudgeResult } from '@app/contracts';

import { ProcessJudgeRequestUseCase } from './process-judge-request.use-case';

const request: JudgeRequest = {
  executionId: 'exec-1',
  submissionId: 'sub-1',
  mode: 'SUBMIT',
  problemType: 'STANDARD',
  language: 'python',
  sourceCode: 'print(1)',
  testCases: [{ stdin: '', expectedOutput: '1', score: 5 }],
  timeLimitMs: 1000,
  memoryLimitMb: 128,
};

const accepted: JudgeResult = {
  executionId: 'exec-1',
  submissionId: 'sub-1',
  mode: 'SUBMIT',
  status: 'ACCEPTED',
};

describe('ProcessJudgeRequestUseCase', () => {
  const judge = jest.fn<Promise<JudgeResult>, [JudgeRequest]>();
  const useCase = new ProcessJudgeRequestUseCase({ judge });

  beforeEach(() => {
    judge.mockReset().mockResolvedValue(accepted);
  });

  it('judges a valid request and returns its result', async () => {
    await expect(useCase.execute(request)).resolves.toEqual(accepted);
    expect(judge).toHaveBeenCalledWith(request);
  });

  it('answers an invalid but correlatable request with INTERNAL_ERROR without running code', async () => {
    const result = await useCase.execute({ ...request, testCases: [] });
    expect(result).toEqual({
      executionId: 'exec-1',
      submissionId: 'sub-1',
      mode: 'SUBMIT',
      status: 'INTERNAL_ERROR',
      stderr: 'Invalid judge request',
    });
    expect(judge).not.toHaveBeenCalled();
  });

  it('returns nothing for a message that cannot be correlated', async () => {
    await expect(useCase.execute({ sourceCode: 'secret' })).resolves.toBeUndefined();
    expect(judge).not.toHaveBeenCalled();
  });
});
