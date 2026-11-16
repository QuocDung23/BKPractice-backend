import { ApiProperty } from '@nestjs/swagger';
export class CourseQuizSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
}

class PageMetaDto {
  @ApiProperty() total!: number;
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
}

// ---- Hướng người học: không có trạng thái, người tạo hay Problem bị ẩn ----

export class ProblemSummaryResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() title!: string;
  @ApiProperty() problemType!: string;
  @ApiProperty() difficulty!: string;
}

export class CourseChapterResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty({ type: [CourseQuizSummaryDto] }) quizzes?: CourseQuizSummaryDto[];
  @ApiProperty({ type: [ProblemSummaryResponseDto] }) problems!: ProblemSummaryResponseDto[];
}

export class CourseDetailResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty({ type: [CourseChapterResponseDto] }) chapters!: CourseChapterResponseDto[];
}

export class CourseSummaryResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() title!: string;
  @ApiProperty() chapterCount!: number;
}

export class CourseListResponseDto extends PageMetaDto {
  @ApiProperty({ type: [CourseSummaryResponseDto] }) items!: CourseSummaryResponseDto[];
}

// ---- Hướng quản lý ----

export class ManagedProblemResponseDto {
  @ApiProperty({ format: 'uuid' }) problemId!: string;
  @ApiProperty({ nullable: true, type: String }) slug!: string | null;
  @ApiProperty({ nullable: true, type: String }) title!: string | null;
  @ApiProperty({ nullable: true, enum: ['DRAFT', 'PUBLISHED', 'ON_HOLD'] }) publishStatus!:
    'DRAFT' | 'PUBLISHED' | 'ON_HOLD' | null;
  @ApiProperty({ nullable: true, type: Boolean }) isDeleted!: boolean | null;
}

export class ManagedChapterResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty({ type: [CourseQuizSummaryDto] }) quizzes?: CourseQuizSummaryDto[];
  @ApiProperty({ type: [ManagedProblemResponseDto] }) problems!: ManagedProblemResponseDto[];
}

export class ReadinessResponseDto {
  @ApiProperty() ready!: boolean;
  @ApiProperty({
    type: [String],
    description: 'TITLE_REQUIRED, CHAPTER_REQUIRED, PUBLISHED_CONTENT_REQUIRED',
  })
  issues!: string[];
}

export class ManagedCourseResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true, type: String }) description!: string | null;
  @ApiProperty({ enum: ['DRAFT', 'PUBLISHED', 'ON_HOLD'] }) status!: string;
  @ApiProperty({ format: 'uuid' }) createdBy!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) deletedAt!: string | null;
  @ApiProperty({ type: [ManagedChapterResponseDto] }) chapters!: ManagedChapterResponseDto[];
  @ApiProperty({ type: ReadinessResponseDto }) readiness!: ReadinessResponseDto;
}

export class ManagedCourseSummaryResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ enum: ['DRAFT', 'PUBLISHED', 'ON_HOLD'] }) status!: string;
  @ApiProperty() chapterCount!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) deletedAt!: string | null;
}

export class ManagedCourseListResponseDto extends PageMetaDto {
  @ApiProperty({ type: [ManagedCourseSummaryResponseDto] })
  items!: ManagedCourseSummaryResponseDto[];
}
