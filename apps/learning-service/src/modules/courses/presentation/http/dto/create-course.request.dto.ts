import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateCourseRequestDto {
  @ApiProperty({
    maxLength: 220,
    description:
      'Unique, immutable after creation. The slug managed is reserved (case-insensitive).',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(220)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'slug chỉ gồm chữ thường a-z, số 0-9 và dấu gạch ngang, không bắt đầu/kết thúc bằng gạch ngang.',
  })
  slug!: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ nullable: true, description: 'Restricted Markdown.' })
  @IsOptional()
  @IsString()
  description?: string | null;
}
