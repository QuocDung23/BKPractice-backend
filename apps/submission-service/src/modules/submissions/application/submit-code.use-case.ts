import { AlreadySubmittedError } from '@submission/modules/submissions/domain/already-submitted.error';
import type { JudgeJobPort } from '@submission/modules/submissions/domain/ports/judge-job.port';
import type { LearningJudgePackagePort } from '@submission/modules/submissions/domain/ports/learning-judge-package.port';
import type { SubmissionRepositoryPort } from '@submission/modules/submissions/domain/ports/submission-repository.port';
import type { ProblemSubmissionState } from '@submission/modules/submissions/domain/submission-record';
import {
  SubmissionKind,
  SubmissionStatus,
  createSubmitRecord,
} from '@submission/modules/submissions/domain/submission-record';

export interface SubmitCodeInput {
  readonly userId: string;
  readonly problemId: string;
  readonly language: string;
  readonly sourceCode: string;
}

export interface SubmitCodeAcceptance {
  readonly id: string;
  readonly kind: SubmissionKind.Submit;
  readonly status: SubmissionStatus.Queued;
  readonly problemId: string;
  readonly language: string;
  readonly createdAt: Date;
}

export class SubmitCodeUseCase {
  constructor(
    private readonly learning: LearningJudgePackagePort,
    private readonly repository: SubmissionRepositoryPort,
    private readonly judge: JudgeJobPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  getProblemSubmissionState(userId: string, problemId: string): Promise<ProblemSubmissionState> {
    return this.repository.getProblemSubmissionState(userId, problemId);
  }

  async execute(input: SubmitCodeInput): Promise<SubmitCodeAcceptance> {
    const { userId, problemId } = input;
    const { state } = await this.getProblemSubmissionState(userId, problemId);
    if (state !== 'READY') throw new AlreadySubmittedError(state);

    const judgePackage = await this.learning.getPackage(input.problemId, input.language);
    const saved = await this.repository
      .saveOfficialSubmission(createSubmitRecord({ ...input, now: this.now() }))
      .catch(async (error: unknown) => {
        if (!(error instanceof AlreadySubmittedError)) throw error;
        const current = await this.getProblemSubmissionState(userId, problemId);
        throw new AlreadySubmittedError(current.state === 'SOLVED' ? 'SOLVED' : 'JUDGING');
      });

    try {
      await this.judge.publish({
        submissionId: saved.id,
        kind: SubmissionKind.Submit,
        problemId: input.problemId,
        language: saved.language,
        sourceCode: saved.sourceCode,
        judgePackage,
      });
    } catch (error: unknown) {
      await this.repository.markFailedToDispatch(saved.id, this.now());
      throw error;
    }

    // A fast verdict may already have moved the record past PENDING; the job is still accepted.
    await this.repository.markQueued(saved.id, this.now());

    return {
      id: saved.publicId,
      kind: SubmissionKind.Submit,
      status: SubmissionStatus.Queued,
      problemId: input.problemId,
      language: saved.language,
      createdAt: saved.createdAt,
    };
  }
}
