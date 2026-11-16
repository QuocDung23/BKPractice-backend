import { Inject, Injectable } from '@nestjs/common';

export interface SubmissionCount {
  userId: string;
  problemId: string;
  count: number;
}

export interface SubmissionCountReader {
  count(userIds: readonly string[], problemIds: readonly string[]): Promise<SubmissionCount[]>;
}

export const SUBMISSION_COUNT_READER = Symbol('SUBMISSION_COUNT_READER');

@Injectable()
export class CountCourseSubmissionsUseCase {
  constructor(@Inject(SUBMISSION_COUNT_READER) private readonly reader: SubmissionCountReader) {}

  async execute(
    userIds: readonly string[],
    problemIds: readonly string[],
  ): Promise<SubmissionCount[]> {
    if (!userIds.length || !problemIds.length) return [];
    return this.reader.count(userIds, problemIds);
  }
}
