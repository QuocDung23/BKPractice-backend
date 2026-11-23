import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from '@submission/modules/submissions/application/list-submission-history.use-case';
import { SubmissionKind } from '@submission/modules/submissions/domain/submission-record';
import { IsProblemId } from '@submission/presentation/validation/is-problem-id';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsUUID, Max, Min, ValidateIf } from 'class-validator';

// The owner is never a query parameter; it only comes from the trusted x-auth-user-id header.
export class ListSubmissionHistoryQueryDto {
  @ApiPropertyOptional({ enum: SubmissionKind })
  @IsOptional()
  @IsIn(Object.values(SubmissionKind))
  kind?: SubmissionKind;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsProblemId()
  problemId?: string;

  // cursor and cursorId must arrive together: a half cursor is rejected instead of silently
  // returning the first page.
  @ApiPropertyOptional({
    format: 'date-time',
    description: 'nextCursor.createdAt of the previous page',
  })
  @ValidateIf((query: ListSubmissionHistoryQueryDto) => hasCursorPart(query))
  @IsISO8601({ strict: true })
  cursor?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'nextCursor.publicId of the previous page' })
  @ValidateIf((query: ListSubmissionHistoryQueryDto) => hasCursorPart(query))
  @IsUUID('4')
  cursorId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;
}

function hasCursorPart(query: ListSubmissionHistoryQueryDto): boolean {
  return query.cursor !== undefined || query.cursorId !== undefined;
}
