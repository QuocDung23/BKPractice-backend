import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiConflictResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { GetSubmissionDetailUseCase } from '@submission/modules/submissions/application/get-submission-detail.use-case';
import { ListSubmissionHistoryUseCase } from '@submission/modules/submissions/application/list-submission-history.use-case';
import { SubmitCodeUseCase } from '@submission/modules/submissions/application/submit-code.use-case';
import { AlreadySubmittedError } from '@submission/modules/submissions/domain/already-submitted.error';
import {
  JudgePackageUnavailableError,
  ProblemNotSubmittableError,
} from '@submission/modules/submissions/domain/ports/learning-judge-package.port';
import {
  PROBLEM_SUBMISSION_STATES,
  type ProblemSubmissionState,
} from '@submission/modules/submissions/domain/submission-record';
import { ProblemSubmissionParamsDto } from '@submission/modules/submissions/presentation/dto/problem-submission-params.dto';

import { TrustedOwner } from './decorators/trusted-owner.decorator';
import { ListSubmissionHistoryQueryDto } from './dto/list-submission-history.query.dto';
import { SubmissionDetailDto } from './dto/submission-detail.dto';
import { SubmissionHistoryPageDto } from './dto/submission-history-page.dto';
import { SubmitCodeRequestDto } from './dto/submit-code-request.dto';
import { SubmitCodeResponseDto } from './dto/submit-code-response.dto';
import {
  SUBMISSION_ERRORS,
  createSubmissionError,
  createSubmissionIdInvalidError,
} from './submission-errors';

@ApiTags('submissions')
@Controller('api')
export class SubmissionsController {
  constructor(
    private readonly listSubmissionHistory: ListSubmissionHistoryUseCase,
    private readonly getSubmissionDetail: GetSubmissionDetailUseCase,
    private readonly submitCode: SubmitCodeUseCase,
  ) {}

  @Post('submissions')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({ type: SubmitCodeResponseDto })
  @ApiConflictResponse({
    description: 'The problem is already solved or a submission is being graded.',
  })
  async submit(
    @TrustedOwner() ownerId: string,
    @Body() dto: SubmitCodeRequestDto,
  ): Promise<SubmitCodeResponseDto> {
    try {
      const result = await this.submitCode.execute({ userId: ownerId, ...dto });
      return { ...result, createdAt: result.createdAt.toISOString() };
    } catch (error: unknown) {
      if (error instanceof ProblemNotSubmittableError) {
        throw createSubmissionError(SUBMISSION_ERRORS.problemNotSubmittable);
      }
      if (error instanceof JudgePackageUnavailableError) {
        throw createSubmissionError(SUBMISSION_ERRORS.judgePackageUnavailable);
      }
      if (error instanceof AlreadySubmittedError) {
        throw createSubmissionError(
          error.state === 'SOLVED'
            ? SUBMISSION_ERRORS.alreadySubmitted
            : SUBMISSION_ERRORS.submissionInProgress,
        );
      }
      throw error;
    }
  }

  @Get('submissions/problems/:problemId/status')
  @Header('Cache-Control', 'private, no-store')
  @ApiParam({ name: 'problemId', schema: { type: 'string', format: 'uuid' } })
  @ApiOkResponse({
    schema: {
      type: 'object',
      required: ['state', 'submissionId'],
      properties: {
        state: { type: 'string', enum: [...PROBLEM_SUBMISSION_STATES] },
        submissionId: { type: 'string', format: 'uuid', nullable: true },
      },
    },
  })
  async getProblemSubmissionStatus(
    @TrustedOwner() ownerId: string,
    @Param() { problemId }: ProblemSubmissionParamsDto,
  ): Promise<ProblemSubmissionState> {
    return this.submitCode.getProblemSubmissionState(ownerId, problemId);
  }

  @Get('submissions')
  @ApiOkResponse({ type: SubmissionHistoryPageDto })
  async list(
    @TrustedOwner() ownerId: string,
    @Query() query: ListSubmissionHistoryQueryDto,
  ): Promise<SubmissionHistoryPageDto> {
    const page = await this.listSubmissionHistory.execute({
      ownerId,
      filter: { kind: query.kind, problemId: query.problemId },
      cursor:
        query.cursor && query.cursorId
          ? { createdAt: query.cursor, publicId: query.cursorId }
          : null,
      limit: query.limit,
    });
    return { ...page, items: [...page.items] };
  }

  @Get('submissions/:publicId')
  @ApiOkResponse({ type: SubmissionDetailDto })
  async get(
    @TrustedOwner() ownerId: string,
    @Param(
      'publicId',
      new ParseUUIDPipe({ version: '4', exceptionFactory: createSubmissionIdInvalidError }),
    )
    publicId: string,
  ): Promise<SubmissionDetailDto> {
    const detail = await this.getSubmissionDetail.execute({
      ownerId,
      publicIdOrLegacyId: publicId,
    });
    if (!detail) throw createSubmissionError(SUBMISSION_ERRORS.submissionNotFound);
    return detail;
  }
}
