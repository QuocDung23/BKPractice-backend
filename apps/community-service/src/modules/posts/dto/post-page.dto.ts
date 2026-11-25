import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsUUID, ValidateIf } from 'class-validator';

import { CommentPageQueryDto } from '@/modules/posts/dto/comment-page-query.dto';
import { PostSummaryDto } from '@/modules/posts/dto/post-summary.dto';
import { PostScope } from '@/modules/posts/entities';

export class PostPageQueryDto extends CommentPageQueryDto {
  @ApiPropertyOptional({ enum: PostScope })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(PostScope)
  scope?: PostScope;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUUID()
  problemId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUUID()
  courseId?: string;
}
export class PostPageDto {
  @ApiProperty({ type: [PostSummaryDto] }) items!: PostSummaryDto[];
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() total!: number;
}
