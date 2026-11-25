import type { SupportedLanguage } from '@app/contracts';
import type { CreateProblemCommand } from '@learning/modules/problems/application/command/create-problem.command';
import type {
  AddTestCaseCommand,
  ReorderTestCasesCommand,
  SetHarnessCommand,
  UpdateTestCaseCommand,
} from '@learning/modules/problems/application/command/test-case.commands';
import type { UpdateProblemCommand } from '@learning/modules/problems/application/command/update-problem.command';
import { DomainValidationError } from '@learning/modules/problems/domain/errors/domain-validation.error';
import {
  Constraints,
  DisplayOrder,
  EnabledLanguage,
  ExecutionLimits,
  ExpectedOutput,
  FunctionContract,
  HarnessSource,
  InputSpecification,
  OopContract,
  OutputSpecification,
  ProblemStatement,
  ProblemTitle,
  Slug,
  StarterCode,
  TagReference,
  TestCaseId,
  TestCaseInput,
  TestCaseScore,
  TestCaseVisibility,
  TopicReference,
  VisibleExample,
  type OopMethod,
} from '@learning/modules/problems/domain/value-objects';
import type {
  FunctionContractDto,
  FunctionParameterDto,
  OopContractDto,
  OopMethodDto,
  VisibleExampleDto,
} from '@learning/modules/problems/presentation/http/dto/content.dto';
import type { CreateProblemRequestDto } from '@learning/modules/problems/presentation/http/dto/create-problem.request.dto';
import type {
  AddTestCaseRequestDto,
  ReorderTestCasesRequestDto,
  SetHarnessRequestDto,
  UpdateTestCaseRequestDto,
} from '@learning/modules/problems/presentation/http/dto/test-case.request.dto';
import type { UpdateProblemRequestDto } from '@learning/modules/problems/presentation/http/dto/update-problem.request.dto';
import { Injectable } from '@nestjs/common';

const DEFAULT_TIME_LIMIT_MS = 1_000;
const DEFAULT_MEMORY_LIMIT_MB = 256;

@Injectable()
export class ProblemRequestMapper {
  toCreateCommand(dto: CreateProblemRequestDto): CreateProblemCommand {
    const limits = dto.executionLimits ?? {
      timeLimitMs: DEFAULT_TIME_LIMIT_MS,
      memoryLimitMb: DEFAULT_MEMORY_LIMIT_MB,
    };

    return {
      ...(dto.slug === undefined ? {} : { slug: new Slug(dto.slug) }),
      title: new ProblemTitle(dto.title),
      statement: new ProblemStatement(dto.statement),
      inputSpecification: nullableString(dto.inputSpecification, InputSpecification),
      outputSpecification: nullableString(dto.outputSpecification, OutputSpecification),
      problemType: dto.problemType,
      difficulty: dto.difficulty,
      examples: (dto.examples ?? []).map(toVisibleExample),
      constraints: nullableString(dto.constraints, Constraints),
      executionLimits: new ExecutionLimits(limits),
      topicIds: (dto.topicIds ?? []).map((id) => new TopicReference(id).value),
      tagIds: (dto.tagIds ?? []).map((id) => new TagReference(id).value),
      enabledLanguages: (dto.enabledLanguages ?? []).map(
        (language) => new EnabledLanguage(language),
      ),
      starterCodes: (dto.starterCodes ?? []).map((starterCode) => new StarterCode(starterCode)),
      functionContracts: toFunctionContractMap(dto.functionContracts ?? []),
      oopContracts: toOopContractMap(dto.oopContracts ?? []),
    };
  }

  toUpdateCommand(dto: UpdateProblemRequestDto): UpdateProblemCommand {
    const command: MutableUpdateCommand = {};

    if (dto.title !== undefined) {
      command.title = new ProblemTitle(dto.title);
    }

    if (dto.statement !== undefined) {
      command.statement = new ProblemStatement(dto.statement);
    }

    if (dto.inputSpecification !== undefined) {
      command.inputSpecification = nullableString(dto.inputSpecification, InputSpecification);
    }

    if (dto.outputSpecification !== undefined) {
      command.outputSpecification = nullableString(dto.outputSpecification, OutputSpecification);
    }

    if (dto.problemType !== undefined) {
      command.problemType = dto.problemType;
    }

    if (dto.difficulty !== undefined) {
      command.difficulty = dto.difficulty;
    }

    if (dto.examples !== undefined) {
      command.examples = dto.examples.map(toVisibleExample);
    }

    if (dto.constraints !== undefined) {
      command.constraints = nullableString(dto.constraints, Constraints);
    }

    if (dto.executionLimits !== undefined) {
      command.executionLimits = new ExecutionLimits(dto.executionLimits);
    }

    if (dto.topicIds !== undefined) {
      command.topicIds = dto.topicIds.map((id) => new TopicReference(id).value);
    }

    if (dto.tagIds !== undefined) {
      command.tagIds = dto.tagIds.map((id) => new TagReference(id).value);
    }

    if (dto.enabledLanguages !== undefined) {
      command.enabledLanguages = dto.enabledLanguages.map(
        (language) => new EnabledLanguage(language),
      );
    }

    if (dto.starterCodes !== undefined) {
      command.starterCodes = dto.starterCodes.map((starterCode) => new StarterCode(starterCode));
    }

    if (dto.functionContracts !== undefined) {
      command.functionContracts = toFunctionContractMap(dto.functionContracts);
    }

    if (dto.oopContracts !== undefined) {
      command.oopContracts = toOopContractMap(dto.oopContracts);
    }

    return command;
  }

  toAddTestCaseCommand(dto: AddTestCaseRequestDto): AddTestCaseCommand {
    return {
      input: new TestCaseInput(dto.input ?? ''),
      expectedOutput: new ExpectedOutput(dto.expectedOutput),
      visibility: new TestCaseVisibility(dto.visibility ?? 'HIDDEN'),
      score: new TestCaseScore(dto.score),
      ...(dto.displayOrder === undefined
        ? {}
        : { displayOrder: new DisplayOrder(dto.displayOrder) }),
    };
  }

  toUpdateTestCaseCommand(dto: UpdateTestCaseRequestDto): UpdateTestCaseCommand {
    const command: MutableUpdateTestCaseCommand = {};

    if (dto.input !== undefined) {
      command.input = new TestCaseInput(dto.input);
    }

    if (dto.expectedOutput !== undefined) {
      command.expectedOutput = new ExpectedOutput(dto.expectedOutput);
    }

    if (dto.visibility !== undefined) {
      command.visibility = new TestCaseVisibility(dto.visibility);
    }

    if (dto.score !== undefined) {
      command.score = new TestCaseScore(dto.score);
    }

    if (dto.displayOrder !== undefined) {
      command.displayOrder = new DisplayOrder(dto.displayOrder);
    }

    return command;
  }

  toReorderTestCasesCommand(dto: ReorderTestCasesRequestDto): ReorderTestCasesCommand {
    return {
      testCaseIds: dto.testCaseIds.map((testCaseId) => TestCaseId.from(testCaseId)),
    };
  }

  toSetHarnessCommand(language: string, dto: SetHarnessRequestDto): SetHarnessCommand {
    return {
      language,
      source: new HarnessSource(dto.source),
    };
  }
}

type MutableUpdateCommand = {
  -readonly [K in keyof UpdateProblemCommand]: UpdateProblemCommand[K];
};

type MutableUpdateTestCaseCommand = {
  -readonly [K in keyof UpdateTestCaseCommand]: UpdateTestCaseCommand[K];
};

function nullableString<T>(
  value: string | null | undefined,
  factory: new (value: string) => T,
): T | null {
  return value === undefined || value === null ? null : new factory(value);
}

function toVisibleExample(example: VisibleExampleDto): VisibleExample {
  return new VisibleExample({
    input: example.input,
    output: example.output,
    explanation: example.explanation ?? null,
  });
}

function toFunctionContractMap(
  contracts: readonly FunctionContractDto[],
): ReadonlyMap<SupportedLanguage, FunctionContract> {
  const result = new Map<SupportedLanguage, FunctionContract>();

  for (const contract of contracts) {
    if (result.has(contract.language)) {
      throw new DomainValidationError(
        'functionContracts.language',
        'function contract languages must be unique',
      );
    }

    result.set(
      contract.language,
      new FunctionContract({
        functionName: contract.functionName,
        parameters: contract.parameters.map(toFunctionParameter),
        returnType: contract.returnType,
      }),
    );
  }

  return result;
}

function toOopContractMap(
  contracts: readonly OopContractDto[],
): ReadonlyMap<SupportedLanguage, OopContract> {
  const result = new Map<SupportedLanguage, OopContract>();

  for (const contract of contracts) {
    if (result.has(contract.language)) {
      throw new DomainValidationError(
        'oopContracts.language',
        'OOP contract languages must be unique',
      );
    }

    result.set(
      contract.language,
      new OopContract({
        structure: contract.structure,
        name: contract.name,
        constructorContract:
          contract.constructorContract === undefined || contract.constructorContract === null
            ? null
            : {
                access: contract.constructorContract.access,
                parameters: contract.constructorContract.parameters.map(toFunctionParameter),
              },
        methods: contract.methods.map(toOopMethod),
      }),
    );
  }

  return result;
}

function toOopMethod(method: OopMethodDto): OopMethod {
  return {
    name: method.name,
    access: method.access,
    parameters: method.parameters.map(toFunctionParameter),
    returnType: method.returnType,
  };
}

function toFunctionParameter(parameter: FunctionParameterDto) {
  return { name: parameter.name, type: parameter.type };
}
