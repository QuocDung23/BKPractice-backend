import { ApiProperty } from '@nestjs/swagger';

export class CommentModerationDto {
  @ApiProperty({ enum: ['VISIBLE', 'HIDDEN'] }) status!: 'VISIBLE' | 'HIDDEN';
}
