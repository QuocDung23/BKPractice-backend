import { SUPPORTED_LANGUAGES } from '@app/contracts';
import type { SupportedLanguage } from '@app/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { IsProblemId } from '@submission/presentation/validation/is-problem-id';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RunCodeDto {
  @ApiProperty({ enum: SUPPORTED_LANGUAGES })
  @IsIn(SUPPORTED_LANGUAGES)
  language!: SupportedLanguage;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100_000)
  sourceCode!: string;

  @ApiProperty({ default: '' })
  @IsString()
  @MaxLength(100_000)
  stdin!: string;

  @ApiProperty({ required: false, format: 'uuid' })
  @IsOptional()
  @IsProblemId()
  problemId?: string;
}
