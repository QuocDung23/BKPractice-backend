import { ApplicationError } from './application.error';

export class ProblemInPublishedCourseError extends ApplicationError {
  readonly code = 'PROBLEM_IN_PUBLISHED_COURSE';

  constructor(readonly problemId: string) {
    super(`Problem ${problemId} is used by a published course`);
  }
}
