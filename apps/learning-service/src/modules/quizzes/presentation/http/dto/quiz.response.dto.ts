import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
export class LearnerOptionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() content!: string;
}
export class QuizFeedbackDto {
  @ApiProperty({ format: 'uuid' }) questionId!: string;
  @ApiProperty({ format: 'uuid' }) selectedOptionId!: string;
  @ApiProperty() isCorrect!: boolean;
  @ApiProperty({ format: 'uuid' }) correctOptionId!: string;
  @ApiProperty() explanation!: string;
  @ApiProperty({ type: String, format: 'date-time' }) answeredAt!: string;
}
export class LearnerQuestionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() content!: string;
  @ApiProperty({ type: [LearnerOptionDto] }) options!: LearnerOptionDto[];
  @ApiPropertyOptional({ type: QuizFeedbackDto, nullable: true }) feedback!: QuizFeedbackDto | null;
}
export class QuizSummaryDto {
  @ApiProperty() correctCount!: number;
  @ApiProperty() wrongCount!: number;
  @ApiProperty() totalQuestions!: number;
  @ApiProperty() percentage!: number;
  @ApiProperty({ example: 90 }) thresholdPercentage!: number;
  @ApiProperty() passed!: boolean;
  @ApiProperty({ type: String, format: 'date-time' }) startedAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) finishedAt!: string;
}
export class LearnerAttemptDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) quizId!: string;
  @ApiProperty({ format: 'uuid' }) quizRevisionId!: string;
  @ApiProperty({ enum: ['IN_PROGRESS', 'FINISHED'] }) status!: string;
  @ApiProperty() totalQuestions!: number;
  @ApiProperty() answeredCount!: number;
  @ApiProperty({ type: String, format: 'date-time' }) startedAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) finishedAt!: string | null;
  @ApiProperty({ type: [LearnerQuestionDto] }) questions!: LearnerQuestionDto[];
  @ApiPropertyOptional({ type: QuizSummaryDto, nullable: true }) summary!: QuizSummaryDto | null;
}
export class QuizIntroDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty() questionCount!: number;
}
export class CompletionDto {
  @ApiProperty() completed!: boolean;
  @ApiProperty() bestPercentage!: number;
  @ApiProperty({ nullable: true, type: String }) passedRevisionId!: string | null;
}

export class ManagedOptionDto extends LearnerOptionDto {
  @ApiProperty() isCorrect!: boolean;
}
export class QuestionRevisionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) questionId!: string;
  @ApiProperty() revision!: number;
  @ApiProperty({ maxLength: 20000 }) content!: string;
  @ApiProperty({ maxLength: 20000 }) explanation!: string;
  @ApiProperty({ type: [ManagedOptionDto], minItems: 2, maxItems: 6 }) options!: ManagedOptionDto[];
  @ApiProperty({ enum: ['EASY', 'MEDIUM', 'HARD'] }) difficulty!: string;
  @ApiProperty({ type: [String] }) topicIds!: string[];
  @ApiProperty({ type: [String] }) tagIds!: string[];
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
}
export class ManagedQuestionDto {
  @ApiProperty({
    description:
      'Whether this question is visible only to its owner, ADMIN, and granted lecturers.',
  })
  isPrivate!: boolean;
  @ApiProperty({
    type: [String],
    nullable: true,
    description: 'Grant recipients, visible only to owner/ADMIN.',
  })
  sharedWith!: string[] | null;
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) createdBy!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) deletedAt!: string | null;
  @ApiProperty({ type: QuestionRevisionDto }) revision!: QuestionRevisionDto;
}
export class QuizItemResponseDto {
  @ApiProperty({ format: 'uuid' }) questionId!: string;
  @ApiProperty({ format: 'uuid' }) questionRevisionId!: string;
}
export class QuizRevisionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) quizId!: string;
  @ApiProperty() revision!: number;
  @ApiProperty({ maxLength: 200 }) title!: string;
  @ApiProperty({ type: String, nullable: true, maxLength: 20000 }) description!: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) publishedAt!: string | null;
  @ApiProperty({ type: [QuizItemResponseDto], maxItems: 50 }) items!: QuizItemResponseDto[];
}
export class ManagedQuizDto {
  @ApiProperty({
    type: [String],
    nullable: true,
    description: 'Grant recipients, visible only to owner/ADMIN.',
  })
  sharedWith!: string[] | null;
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) createdBy!: string;
  @ApiProperty({ enum: ['DRAFT', 'PUBLISHED', 'ON_HOLD'] }) status!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) deletedAt!: string | null;
  @ApiProperty({
    type: QuizRevisionDto,
    nullable: true,
    description: 'Only owner/ADMIN can see draft.',
  })
  draft!: QuizRevisionDto | null;
  @ApiProperty({ type: QuizRevisionDto, nullable: true }) published!: QuizRevisionDto | null;
}
export class QuestionUpdateDto {
  @ApiProperty({ format: 'uuid' }) questionId!: string;
  @ApiProperty({ format: 'uuid' }) selectedRevisionId!: string;
  @ApiProperty({ type: String, nullable: true }) currentRevisionId!: string | null;
  @ApiProperty() usable!: boolean;
}
export class QuizReadinessDto {
  @ApiProperty() ready!: boolean;
  @ApiProperty({ type: [String] }) issues!: string[];
}
export class QuizPreviewDto {
  @ApiProperty({ type: ManagedQuizDto }) quiz!: ManagedQuizDto;
  @ApiProperty({ type: [QuestionRevisionDto] }) questions!: QuestionRevisionDto[];
  @ApiProperty({ type: [QuestionUpdateDto] }) questionUpdates!: QuestionUpdateDto[];
  @ApiProperty({ type: QuizReadinessDto }) readiness!: QuizReadinessDto;
}
export class QuizUsageDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
}
export class PaginationDto {
  @ApiProperty() total!: number;
  @ApiProperty({ minimum: 1 }) page!: number;
  @ApiProperty({ minimum: 1, maximum: 100 }) limit!: number;
}
export class BankQuestionPageDto extends PaginationDto {
  @ApiProperty({ type: [ManagedQuestionDto] }) items!: ManagedQuestionDto[];
}
export class ManagedQuizPageDto extends PaginationDto {
  @ApiProperty({ type: [ManagedQuizDto] }) items!: ManagedQuizDto[];
}
export class AttemptPageDto extends PaginationDto {
  @ApiProperty({ type: [LearnerAttemptDto] }) items!: LearnerAttemptDto[];
}
