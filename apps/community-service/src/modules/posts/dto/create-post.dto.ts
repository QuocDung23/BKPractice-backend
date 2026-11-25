import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsString, MaxLength, MinLength, Validate } from 'class-validator';

import { PostTargetConstraint } from '@/modules/posts/dto/post-target.constraint';
import { PostScope } from '@/modules/posts/entities';

export class CreatePostDto {
  @ApiProperty({ enum: PostScope })
  @IsEnum(PostScope)
  scope!: PostScope;

  @ApiProperty({
    minLength: 1,
    maxLength: 10_000,
    description: 'Content is trimmed before validation.',
  })
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  content!: string;

  @ApiProperty({
    required: false,
    format: 'uuid',
    description: 'Required only for PROBLEM; omit for other scopes.',
  })
  @Validate(PostTargetConstraint)
  problemId?: string;

  @ApiProperty({
    required: false,
    format: 'uuid',
    description: 'Required only for COURSE; omit for other scopes.',
  })
  @Validate(PostTargetConstraint)
  courseId?: string;
}
