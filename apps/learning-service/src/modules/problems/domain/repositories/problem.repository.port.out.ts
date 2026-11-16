import type { ProblemType } from '@app/contracts';
import type { Problem } from '@learning/modules/problems/domain/problem.aggregate';
import type { Difficulty, TestSuiteSummary } from '@learning/modules/problems/domain/value-objects';

export interface ProblemListFilter {
  readonly search?: string;
  readonly problemType?: ProblemType;
  readonly difficulty?: Difficulty;
  readonly topicId?: string;
  readonly tagId?: string;
  readonly page: number;
  readonly limit: number;
}

export interface ManagedProblemListFilter {
  readonly createdBy?: string;
  readonly includeDeleted: boolean;
  readonly page: number;
  readonly limit: number;
}

export interface ProblemPage<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

export interface ProblemRepository {
  findById(id: string): Promise<Problem | null>;
  findByIdIncludingDeleted(id: string): Promise<Problem | null>;
  findPublishedByIdOrSlug(idOrSlug: string): Promise<Problem | null>;
  findManagedById(id: string, includeDeleted: boolean): Promise<Problem | null>;
  loadForUpdate(id: string, includeDeleted?: boolean): Promise<Problem | null>;
  loadTestSuiteSummary(problemId: string): Promise<TestSuiteSummary>;
  loadTestSuiteSummaries(
    problemIds: readonly string[],
  ): Promise<ReadonlyMap<string, TestSuiteSummary>>;
  listPublished(filter: ProblemListFilter): Promise<ProblemPage<Problem>>;
  listManaged(filter: ManagedProblemListFilter): Promise<ProblemPage<Problem>>;
  isSlugAvailable(slug: string, excludeProblemId?: string): Promise<boolean>;
  save(problem: Problem, expectedUpdatedAt?: Date): Promise<void>;
  softDelete(id: string, at: Date): Promise<boolean>;
  restore(id: string, at: Date): Promise<boolean>;
}
