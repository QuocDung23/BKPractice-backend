import { timingSafeEqual } from 'node:crypto';

import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

import { CountCourseSubmissionsUseCase } from '../application/count-course-submissions.use-case';

import { SUBMISSION_ERRORS, createSubmissionError } from './submission-errors';

class CountSubmissionRequestDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  userIds!: string[];

  @IsArray()
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  problemIds!: string[];
}

@ApiExcludeController()
@Controller('internal/submissions')
export class InternalSubmissionCountsController {
  constructor(
    private readonly countSubmissions: CountCourseSubmissionsUseCase,
    private readonly config: ConfigService,
  ) {}

  @Post('counts')
  async count(
    @Headers('x-internal-service-secret') provided: string | undefined,
    @Body() body: CountSubmissionRequestDto,
  ): Promise<{ counts: Awaited<ReturnType<CountCourseSubmissionsUseCase['execute']>> }> {
    const expected = this.config.getOrThrow<string>('INTERNAL_SERVICE_SECRET');
    if (
      !provided ||
      Buffer.byteLength(provided) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
    )
      throw createSubmissionError(SUBMISSION_ERRORS.internalSecretInvalid);
    return { counts: await this.countSubmissions.execute(body.userIds, body.problemIds) };
  }
}
