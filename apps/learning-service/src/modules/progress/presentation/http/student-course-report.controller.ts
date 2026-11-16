import {
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';

import { TrustedPrincipal } from '@/modules/problems/presentation/http/decorators/trusted-principal.decorator';
import { TrustedPrincipalGuard } from '@/modules/problems/presentation/http/guards/trusted-principal.guard';
import type { Principal } from '@/modules/progress/application/models';
import {
  GetStudentCourseReportUseCase,
  type StudentCourseReportResult,
} from '@/modules/progress/application/reports/get-student-course-report.use-case';
import { PageQueryDto } from '@/modules/progress/presentation/http/dto/progress-query.dto';
import { CourseReportExceptionFilter } from '@/modules/progress/presentation/http/student-course-report.filter';

class ChapterProgressDto {
  @ApiProperty() chapterId!: string;
  @ApiProperty() completed!: number;
  @ApiProperty() total!: number;
}
class StudentCourseReportItemDto {
  @ApiProperty() userId!: string;
  @ApiPropertyOptional({ nullable: true }) studentId!: string | null;
  @ApiPropertyOptional({ nullable: true }) displayName!: string | null;
  @ApiProperty() submissionCount!: number;
  @ApiProperty() completed!: number;
  @ApiProperty() total!: number;
  @ApiProperty() status!: string;
  @ApiProperty({ type: [ChapterProgressDto] }) chapters!: ChapterProgressDto[];
}
class StudentCourseReportResponseDto {
  @ApiProperty({ type: [StudentCourseReportItemDto] }) items!: StudentCourseReportItemDto[];
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() hasMore!: boolean;
  @ApiProperty() courseId!: string;
}

@ApiTags('progress')
@ApiBearerAuth()
@ApiForbiddenResponse({ description: 'Missing content manager permission or Course ownership.' })
@ApiNotFoundResponse({ description: 'Course not found.' })
@ApiServiceUnavailableResponse({ description: 'Identity or Submission service is unavailable.' })
@UseGuards(TrustedPrincipalGuard)
@UseFilters(CourseReportExceptionFilter)
@Controller('api/progress/courses')
export class StudentCourseReportController {
  constructor(
    @Inject(GetStudentCourseReportUseCase) private readonly report: GetStudentCourseReportUseCase,
  ) {}

  @ApiOkResponse({ type: StudentCourseReportResponseDto })
  @Get(':courseId/students')
  async get(
    @TrustedPrincipal() principal: Principal,
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Query() query: PageQueryDto,
  ): Promise<StudentCourseReportResult> {
    return this.report.execute(principal, courseId, query.page, query.limit);
  }
}
