import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiNoContentResponse,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiUnauthorizedResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

import type { Principal } from '@/modules/courses/application/models';
import type {
  IAttachQuizPortIn,
  IDetachQuizPortIn,
  IReorderChapterQuizzesPortIn,
} from '@/modules/courses/application/ports/in';
import {
  ATTACH_QUIZ_PORT_IN,
  DETACH_QUIZ_PORT_IN,
  REORDER_CHAPTER_QUIZZES_PORT_IN,
} from '@/modules/courses/application/ports/in';
import { ManagedCourseResponseDto } from '@/modules/courses/presentation/http/dto';
import { CourseExceptionFilter } from '@/modules/courses/presentation/http/filters';
import { toManagedCourseResponse } from '@/modules/courses/presentation/http/mappers';
import { TrustedPrincipal } from '@/modules/problems/presentation/http/decorators/trusted-principal.decorator';
import { TrustedPrincipalGuard } from '@/modules/problems/presentation/http/guards/trusted-principal.guard';
export class AttachQuizDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() quizId!: string;
  @ApiPropertyOptional({ minimum: 0 }) @IsOptional() @IsInt() @Min(0) position?: number;
}
export class QuizOrderDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  ids!: string[];
}
@ApiTags('courses')
@ApiBadRequestResponse()
@ApiForbiddenResponse()
@ApiNotFoundResponse()
@ApiConflictResponse()
@ApiUnauthorizedResponse()
@ApiBearerAuth()
@UseGuards(TrustedPrincipalGuard)
@UseFilters(CourseExceptionFilter)
@Controller('api/courses/:id/chapters/:chapterId/quizzes')
export class ChapterQuizzesController {
  constructor(
    @Inject(ATTACH_QUIZ_PORT_IN) private readonly attach: IAttachQuizPortIn,
    @Inject(DETACH_QUIZ_PORT_IN) private readonly detach: IDetachQuizPortIn,
    @Inject(REORDER_CHAPTER_QUIZZES_PORT_IN) private readonly reorder: IReorderChapterQuizzesPortIn,
  ) {}
  @Post()
  @ApiCreatedResponse({ type: ManagedCourseResponseDto })
  @ApiOperation({
    summary:
      'Attach a published Quiz; requires course:update, Course ownership and Quiz use permission',
  })
  async attachQuiz(
    @TrustedPrincipal() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('chapterId', ParseUUIDPipe) chapterId: string,
    @Body() body: AttachQuizDto,
  ) {
    return toManagedCourseResponse(
      await this.attach.execute(
        p,
        id.toLowerCase(),
        chapterId.toLowerCase(),
        body.quizId.toLowerCase(),
        body.position,
      ),
    );
  }
  @Delete(':quizId')
  @ApiNoContentResponse()
  @HttpCode(204)
  @ApiOperation({ summary: 'Detach Quiz without deleting its content or history' })
  async detachQuiz(
    @TrustedPrincipal() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('chapterId', ParseUUIDPipe) chapterId: string,
    @Param('quizId', ParseUUIDPipe) quizId: string,
  ): Promise<void> {
    await this.detach.execute(p, id.toLowerCase(), chapterId.toLowerCase(), quizId.toLowerCase());
  }
  @Put('order')
  @ApiOkResponse({ type: ManagedCourseResponseDto })
  @ApiOperation({ summary: 'Reorder the exact set of Chapter Quiz ids' })
  async reorderQuizzes(
    @TrustedPrincipal() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('chapterId', ParseUUIDPipe) chapterId: string,
    @Body() body: QuizOrderDto,
  ) {
    return toManagedCourseResponse(
      await this.reorder.execute(
        p,
        id.toLowerCase(),
        chapterId.toLowerCase(),
        body.ids.map((value) => value.toLowerCase()),
      ),
    );
  }
}
