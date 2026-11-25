import type { ProblemType, SupportedLanguage } from '@app/contracts';
import type {
  Constraints,
  Difficulty,
  EnabledLanguage,
  ExecutionLimits,
  FunctionContract,
  InputSpecification,
  OopContract,
  OutputSpecification,
  ProblemStatement,
  ProblemTitle,
  Slug,
  StarterCode,
  VisibleExample,
} from '@learning/modules/problems/domain/value-objects';

export interface CreateProblemCommand {
  readonly slug?: Slug;
  readonly title: ProblemTitle;
  readonly statement: ProblemStatement;
  readonly inputSpecification: InputSpecification | null;
  readonly outputSpecification: OutputSpecification | null;
  readonly problemType: ProblemType;
  readonly difficulty: Difficulty;
  readonly examples: readonly VisibleExample[];
  readonly constraints: Constraints | null;
  readonly executionLimits: ExecutionLimits;
  readonly topicIds: readonly string[];
  readonly tagIds: readonly string[];
  readonly enabledLanguages: readonly EnabledLanguage[];
  readonly starterCodes: readonly StarterCode[];
  readonly functionContracts: ReadonlyMap<SupportedLanguage, FunctionContract>;
  readonly oopContracts: ReadonlyMap<SupportedLanguage, OopContract>;
}
