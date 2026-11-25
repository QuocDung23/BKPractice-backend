import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { CommentModerationDto } from '@/modules/posts/dto/comment-moderation.dto';

export class ReplySummaryDto {
  @ApiProperty({ type: String, nullable: true }) editedAt!: Date | null;
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) postId!: string;
  @ApiProperty({ format: 'uuid' }) parentCommentId!: string;
  @ApiProperty({ format: 'uuid' }) authorId!: string;
  @ApiProperty() content!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
  @ApiPropertyOptional({
    type: CommentModerationDto,
    description: 'Only returned to the reply author.',
  })
  moderation?: CommentModerationDto;
}
