import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { TransformFnParams } from 'class-transformer';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
export class OptionInputDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @Transform(normalizeUuid)
  @IsUUID()
  id?: string;
  @ApiProperty({ maxLength: 5000 }) @IsString() @Length(1, 5000) content!: string;
  @ApiProperty() @IsBoolean() isCorrect!: boolean;
}
export class QuestionInputDto {
  @ApiProperty({ maxLength: 20000 }) @IsString() @Length(1, 20000) content!: string;
  @ApiProperty({ maxLength: 20000 }) @IsString() @Length(1, 20000) explanation!: string;
  @ApiProperty({ type: [OptionInputDto], minItems: 2, maxItems: 6 })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => OptionInputDto)
  options!: OptionInputDto[];
  @ApiProperty({ enum: ['EASY', 'MEDIUM', 'HARD'] }) @IsIn(['EASY', 'MEDIUM', 'HARD']) difficulty!:
    'EASY' | 'MEDIUM' | 'HARD';
  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @Transform(normalizeUuid)
  @IsUUID(undefined, { each: true })
  topicIds: string[] = [];
  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @Transform(normalizeUuid)
  @IsUUID(undefined, { each: true })
  tagIds: string[] = [];
}
export class CreateQuestionDto extends QuestionInputDto {
  @ApiPropertyOptional({
    default: false,
    description: 'Private questions are visible only to their owner, ADMIN, and granted lecturers.',
  })
  @IsOptional()
  @IsBoolean()
  isPrivate = false;
}
export class CreateQuizDto {
  @ApiProperty({ maxLength: 200 }) @IsString() @Length(1, 200) title!: string;
  @ApiPropertyOptional({ maxLength: 20000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  description: string | null = null;
}
export class UpdateQuizDto {
  @ApiPropertyOptional({ maxLength: 200 }) @IsOptional() @IsString() @Length(1, 200) title?: string;
  @ApiPropertyOptional({ nullable: true, maxLength: 20000 })
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsString()
  @MaxLength(20000)
  description?: string | null;
}
export class QuizItemDto {
  @ApiProperty({ format: 'uuid' }) @Transform(normalizeUuid) @IsUUID() questionId!: string;
  @ApiProperty({ format: 'uuid' }) @Transform(normalizeUuid) @IsUUID() revisionId!: string;
}
export class SelectQuestionsDto {
  @ApiProperty({ type: [QuizItemDto], maxItems: 50 })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => QuizItemDto)
  items!: QuizItemDto[];
}
export class ShareDto {
  @ApiProperty({ format: 'uuid' }) @Transform(normalizeUuid) @IsUUID() userId!: string;
  @ApiProperty() @IsBoolean() enabled!: boolean;
}
export class QuestionVisibilityDto {
  @ApiProperty({
    description: 'true limits use to owner/admin/granted lecturers; false shares with lecturers.',
  })
  @IsBoolean()
  isPrivate!: boolean;
}
export class AnswerDto {
  @ApiProperty({ format: 'uuid' }) @Transform(normalizeUuid) @IsUUID() selectedOptionId!: string;
}
export class QuizPageQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Math.floor(Number.MAX_SAFE_INTEGER / 100))
  page = 1;
  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
  @ApiPropertyOptional({ maxLength: 200 }) @IsOptional() @IsString() @MaxLength(200) q?: string;
  @ApiPropertyOptional({ enum: ['EASY', 'MEDIUM', 'HARD'] })
  @IsOptional()
  @IsIn(['EASY', 'MEDIUM', 'HARD'])
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @Transform(normalizeUuid)
  @IsUUID()
  topicId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @Transform(normalizeUuid)
  @IsUUID()
  tagId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @Transform(normalizeUuid)
  @IsUUID()
  quizId?: string;
}
export class EmptyQuizBodyDto {}

function normalizeUuid(input: TransformFnParams): unknown {
  const value: unknown = input.value;
  return typeof value === 'string'
    ? value.toLowerCase()
    : Array.isArray(value)
      ? value.map((item: unknown) => (typeof item === 'string' ? item.toLowerCase() : item))
      : value;
}
