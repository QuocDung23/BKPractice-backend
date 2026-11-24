import { ApiProperty } from '@nestjs/swagger';

import { ReplySummaryDto } from '@/modules/posts/dto/reply-summary.dto';

export class ReplyPageDto {
  @ApiProperty({ type: ReplySummaryDto, isArray: true }) items!: ReplySummaryDto[];
  @ApiProperty({ minimum: 1 }) page!: number;
  @ApiProperty({ minimum: 1, maximum: 50 }) pageSize!: number;
  @ApiProperty({ minimum: 0 }) total!: number;
}
