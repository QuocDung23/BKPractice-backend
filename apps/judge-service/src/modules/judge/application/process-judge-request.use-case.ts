import type { JudgeRequest, JudgeResult } from '@app/contracts';

import { validateJudgeRequest } from './judge-request.validator';

export const JUDGE_PIPELINE = Symbol('JUDGE_PIPELINE');

/** The evaluation pipeline; it only ever receives a request that passed validation. */
export interface JudgePipeline {
  judge(request: JudgeRequest): Promise<JudgeResult>;
}

export class ProcessJudgeRequestUseCase {
  constructor(private readonly pipeline: JudgePipeline) {}

  /** Returns `undefined` when the message cannot be correlated and must be dropped. */
  async execute(payload: unknown): Promise<JudgeResult | undefined> {
    const validation = validateJudgeRequest(payload);
    if (validation.kind === 'poison') return undefined;
    if (validation.kind === 'valid') return this.pipeline.judge(validation.request);
    return {
      executionId: validation.executionId,
      submissionId: validation.submissionId,
      mode: validation.mode,
      status: 'INTERNAL_ERROR',
      stderr: 'Invalid judge request',
    };
  }
}
