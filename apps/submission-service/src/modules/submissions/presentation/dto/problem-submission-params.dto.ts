import { IsProblemId } from '@submission/presentation/validation/is-problem-id';

export class ProblemSubmissionParamsDto {
  @IsProblemId()
  problemId!: string;
}
