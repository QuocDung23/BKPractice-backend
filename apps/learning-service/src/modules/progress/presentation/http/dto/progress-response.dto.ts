import { ApiProperty } from '@nestjs/swagger';
export class SolvedProblemResponseDto {
  @ApiProperty({ format: 'uuid' }) problemId!: string;
  @ApiProperty({ format: 'date-time' }) solvedAt!: string;
}
export class SolvedProblemPageResponseDto {
  @ApiProperty({ type: [SolvedProblemResponseDto] }) items!: SolvedProblemResponseDto[];
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
}
export class SolvedStatusResponseDto {
  @ApiProperty({ format: 'uuid' }) problemId!: string;
  @ApiProperty() solved!: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) solvedAt!: string | null;
}
export class ChapterProgressResponseDto {
  @ApiProperty({ format: 'uuid' }) chapterId!: string;
  @ApiProperty() completed!: number;
  @ApiProperty({ deprecated: true, description: 'Alias of completed for backward compatibility' })
  solved!: number;
  @ApiProperty() total!: number;
}
export class CompletedLearningItemResponseDto {
  @ApiProperty({ enum: ['PROBLEM', 'QUIZ'] }) type!: 'PROBLEM' | 'QUIZ';
  @ApiProperty({ format: 'uuid' }) itemId!: string;
  @ApiProperty({ format: 'date-time' }) completedAt!: string;
}
export class CourseProgressResponseDto {
  @ApiProperty({ format: 'uuid' }) courseId!: string;
  @ApiProperty() completed!: number;
  @ApiProperty({ deprecated: true, description: 'Alias of completed for backward compatibility' })
  solved!: number;
  @ApiProperty() total!: number;
  @ApiProperty({ type: [ChapterProgressResponseDto] }) chapters!: ChapterProgressResponseDto[];
  @ApiProperty({ type: [CompletedLearningItemResponseDto] })
  completedItems!: CompletedLearningItemResponseDto[];
  @ApiProperty({
    type: [SolvedProblemResponseDto],
    deprecated: true,
    description: 'Problem-only compatibility projection; use completedItems',
  })
  solvedProblems!: SolvedProblemResponseDto[];
}
