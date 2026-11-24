import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateCommentDto {
  @ApiProperty({
    minLength: 1,
    maxLength: 5_000,
    description: 'Content is trimmed before validation.',
  })
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(5_000)
  content!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  parentCommentId?: string;
}
