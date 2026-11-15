import { ApiProperty } from '@nestjs/swagger';

import { TopicResponseDto } from './problem-response.dto';

/**
 * LRN-010: the topic catalog is a dictionary for filters. It has no pagination and no
 * Problem metadata, so the response only carries the approved `id`/`name` pairs.
 */
export class TopicListResponseDto {
  @ApiProperty({ type: [TopicResponseDto] })
  items!: TopicResponseDto[];
}
