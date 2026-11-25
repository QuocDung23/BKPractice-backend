import {
  PROBLEM_TYPES,
  SUPPORTED_LANGUAGES,
  type ProblemType,
  type SupportedLanguage,
} from '@app/contracts';
import type { Difficulty } from '@learning/modules/problems/domain/value-objects';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import {
  ExecutionLimitsDto,
  FunctionContractDto,
  OopContractDto,
  StarterCodeDto,
  VisibleExampleDto,
} from './content.dto';

export class CreateProblemRequestDto {
  @ApiPropertyOptional({
    maxLength: 220,
    description: 'Generated from the title when omitted. Unique and immutable.',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Length(1, 220)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug?: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @Length(1, 200)
  title!: string;

  @ApiProperty({ maxLength: 100_000 })
  @IsString()
  @Length(1, 100_000)
  statement!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 20_000 })
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(20_000)
  inputSpecification?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 20_000 })
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(20_000)
  outputSpecification?: string | null;

  @ApiProperty({ enum: PROBLEM_TYPES })
  @IsIn(PROBLEM_TYPES)
  problemType!: ProblemType;

  @ApiProperty({ enum: ['EASY', 'MEDIUM', 'HARD'] })
  @IsIn(['EASY', 'MEDIUM', 'HARD'])
  difficulty!: Difficulty;

  @ApiPropertyOptional({ type: [VisibleExampleDto] })
  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => VisibleExampleDto)
  examples?: VisibleExampleDto[];

  @ApiPropertyOptional({ nullable: true, maxLength: 20_000 })
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(20_000)
  constraints?: string | null;

  @ApiPropertyOptional({ type: ExecutionLimitsDto })
  @ValidateIf((_, value) => value !== undefined)
  @ValidateNested()
  @Type(() => ExecutionLimitsDto)
  executionLimits?: ExecutionLimitsDto;

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  topicIds?: string[];

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  tagIds?: string[];

  @ApiPropertyOptional({ enum: SUPPORTED_LANGUAGES, isArray: true })
  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayUnique()
  @IsIn(SUPPORTED_LANGUAGES, { each: true })
  enabledLanguages?: SupportedLanguage[];

  @ApiPropertyOptional({ type: [StarterCodeDto] })
  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => StarterCodeDto)
  starterCodes?: StarterCodeDto[];

  @ApiPropertyOptional({ type: [FunctionContractDto] })
  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => FunctionContractDto)
  functionContracts?: FunctionContractDto[];

  @ApiPropertyOptional({ type: [OopContractDto] })
  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => OopContractDto)
  oopContracts?: OopContractDto[];
}
