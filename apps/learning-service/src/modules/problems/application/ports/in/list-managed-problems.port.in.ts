import type { Principal } from '@learning/modules/problems/application/models/principal';
import type { ManagedProblemSummaryResult } from '@learning/modules/problems/application/results/problem.results';
import type {
  ManagedProblemListFilter,
  ProblemPage,
} from '@learning/modules/problems/domain/repositories/problem.repository.port.out';

export interface IListManagedProblemsPortIn {
  execute(
    principal: Principal,
    filter: Omit<ManagedProblemListFilter, 'createdBy'>,
  ): Promise<ProblemPage<ManagedProblemSummaryResult>>;
}

export const LIST_MANAGED_PROBLEMS_PORT_IN = Symbol('LIST_MANAGED_PROBLEMS_PORT_IN');
