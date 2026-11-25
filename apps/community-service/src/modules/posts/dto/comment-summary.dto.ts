import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { CommentModerationDto } from '@/modules/posts/dto/comment-moderation.dto';

export class CommentSummaryDto {
  @ApiProperty({ type: String, nullable: true }) editedAt!: Date | null;
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) postId!: string;
  @ApiProperty({ type: String, nullable: true }) parentCommentId!: null;
  @ApiProperty({ format: 'uuid' }) authorId!: string;
  @ApiProperty() content!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
  @ApiProperty({ minimum: 0 }) replyCount!: number;
  @ApiPropertyOptional({
    type: CommentModerationDto,
    description: 'Only returned to the comment author.',
  })
  moderation?: CommentModerationDto;
}
