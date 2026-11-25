import { ApiProperty } from '@nestjs/swagger';

export class ReactionStateDto {
  @ApiProperty() liked!: boolean;
  @ApiProperty({ minimum: 0 }) likeCount!: number;
}
