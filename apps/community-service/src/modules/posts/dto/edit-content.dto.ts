import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsString,
  MaxLength,
  MinLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'restrictedMarkdown', async: false })
export class RestrictedMarkdownConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const prose = value
      .replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\1[^\n]*(?:\n|$)|(?![\s\S]))/gm, '')
      .replace(/(`+)([\s\S]*?)\1/g, '');
    return !/<\/?[a-z][^>]*>|<!--|<!doctype|<\?|\]\(\s*(?:javascript|vbscript|data)\s*:/i.test(
      prose,
    );
  }
  defaultMessage(): string {
    return 'Content must use restricted Markdown without raw HTML or unsafe links.';
  }
}

export class EditPostDto {
  @ApiProperty({ minLength: 1, maxLength: 10000 })
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  @Validate(RestrictedMarkdownConstraint)
  content!: string;
}
export class EditCommentDto {
  @ApiProperty({ minLength: 1, maxLength: 5000 })
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  @Validate(RestrictedMarkdownConstraint)
  content!: string;
}

export class EditedCommentDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) postId!: string;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) parentCommentId!: string | null;
  @ApiProperty({ format: 'uuid' }) authorId!: string;
  @ApiProperty() content!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) editedAt!: Date | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) deletedAt!: Date | null;
  @ApiProperty({ example: { status: 'VISIBLE' } }) moderation!: { status: 'VISIBLE' | 'HIDDEN' };
}
