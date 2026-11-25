import { ApiProperty } from '@nestjs/swagger';

import { PostScope } from '@/modules/posts/entities';

export class PostSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) authorId!: string;
  @ApiProperty({ enum: PostScope }) scope!: PostScope;
  @ApiProperty() content!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) problemId!: string | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) courseId!: string | null;
  @ApiProperty({ type: String, nullable: true }) editedAt!: Date | null;
  @ApiProperty({ type: String, nullable: true, required: false }) deletedAt?: Date | null;
  @ApiProperty({ required: false, enum: ['VISIBLE', 'HIDDEN'] }) moderation?: {
    status: 'VISIBLE' | 'HIDDEN';
  };
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
  @ApiProperty({ minimum: 0 }) likeCount!: number;
  @ApiProperty({ description: 'Whether the authenticated caller has liked this post.' })
  likedByMe!: boolean;
}
