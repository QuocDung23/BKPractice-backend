import { ApiProperty } from '@nestjs/swagger';

import { CommentSummaryDto } from '@/modules/posts/dto/comment-summary.dto';

export class CommentPageDto {
  @ApiProperty({ type: CommentSummaryDto, isArray: true }) items!: CommentSummaryDto[];
  @ApiProperty({ minimum: 1 }) page!: number;
  @ApiProperty({ minimum: 1, maximum: 50 }) pageSize!: number;
  @ApiProperty({ minimum: 0 }) total!: number;
}
