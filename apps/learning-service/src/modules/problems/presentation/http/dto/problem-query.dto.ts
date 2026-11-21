import { PROBLEM_TYPES, type ProblemType } from '@app/contracts';
import {
  PUBLISH_STATUSES,
  type Difficulty,
  type PublishStatus,
} from '@learning/modules/problems/domain/value-objects';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
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
} from 'class-validator';

export class ProblemQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ enum: PROBLEM_TYPES })
  @IsOptional()
  @IsIn(PROBLEM_TYPES)
  problemType?: ProblemType;

  @ApiPropertyOptional({ enum: ['EASY', 'MEDIUM', 'HARD'] })
  @IsOptional()
  @IsIn(['EASY', 'MEDIUM', 'HARD'])
  difficulty?: Difficulty;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  topicId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  tagId?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class ProblemIdentifierParamDto {
  @ApiProperty({ maxLength: 220 })
  @IsString()
  @Length(1, 220)
  idOrSlug!: string;
}

export class ManagedProblemQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ default: false })
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  includeDeleted = false;

  @ApiPropertyOptional({ enum: PUBLISH_STATUSES })
  @IsOptional()
  @IsIn(PUBLISH_STATUSES)
  publishStatus?: PublishStatus;

  @ApiPropertyOptional({ maxLength: 200, description: 'Case-insensitive title or slug search' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class IncludeDeletedQueryDto {
  @ApiPropertyOptional({ default: false })
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  includeDeleted = false;
}
