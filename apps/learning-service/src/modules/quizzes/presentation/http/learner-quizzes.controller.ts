import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { TrustedPrincipal } from '@/modules/problems/presentation/http/decorators/trusted-principal.decorator';
import { TrustedPrincipalGuard } from '@/modules/problems/presentation/http/guards/trusted-principal.guard';
import {
  ANSWER_QUIZ_QUESTION_PORT_IN,
  type IAnswerQuizQuestionPortIn,
  FINISH_QUIZ_ATTEMPT_PORT_IN,
  type IFinishQuizAttemptPortIn,
  GET_MY_QUIZ_ATTEMPT_PORT_IN,
  type IGetMyQuizAttemptPortIn,
  GET_MY_QUIZ_COMPLETION_PORT_IN,
  type IGetMyQuizCompletionPortIn,
  GET_MY_QUIZ_RESULT_PORT_IN,
  type IGetMyQuizResultPortIn,
  GET_PUBLISHED_QUIZ_PORT_IN,
  type IGetPublishedQuizPortIn,
  LIST_MY_QUIZ_ATTEMPTS_PORT_IN,
  type IListMyQuizAttemptsPortIn,
  START_QUIZ_ATTEMPT_PORT_IN,
  type IStartQuizAttemptPortIn,
} from '@/modules/quizzes/application/ports/in';
import type { Principal } from '@/modules/quizzes/domain';
import {
  AnswerDto,
  AttemptPageDto,
  CompletionDto,
  EmptyQuizBodyDto,
  LearnerAttemptDto,
  QuizFeedbackDto,
  QuizIntroDto,
  QuizPageQueryDto,
  QuizSummaryDto,
} from '@/modules/quizzes/presentation/http/dto';
import { QuizExceptionFilter } from '@/modules/quizzes/presentation/http/quiz-exception.filter';

@ApiTags('learner-quizzes')
@ApiBearerAuth()
@ApiBadRequestResponse()
@ApiForbiddenResponse()
@ApiNotFoundResponse()
@ApiConflictResponse()
@ApiUnauthorizedResponse()
@UseGuards(TrustedPrincipalGuard)
@UseFilters(QuizExceptionFilter)
@Controller('')
export class LearnerQuizzesController {
  constructor(
    @Inject(LIST_MY_QUIZ_ATTEMPTS_PORT_IN)
    private readonly listMyQuizAttempts: IListMyQuizAttemptsPortIn,
    @Inject(GET_PUBLISHED_QUIZ_PORT_IN) private readonly getPublishedQuiz: IGetPublishedQuizPortIn,
    @Inject(GET_MY_QUIZ_COMPLETION_PORT_IN)
    private readonly getMyQuizCompletion: IGetMyQuizCompletionPortIn,
    @Inject(START_QUIZ_ATTEMPT_PORT_IN) private readonly startQuizAttempt: IStartQuizAttemptPortIn,
    @Inject(GET_MY_QUIZ_ATTEMPT_PORT_IN) private readonly getMyQuizAttempt: IGetMyQuizAttemptPortIn,
    @Inject(ANSWER_QUIZ_QUESTION_PORT_IN)
    private readonly answerQuizQuestion: IAnswerQuizQuestionPortIn,
    @Inject(FINISH_QUIZ_ATTEMPT_PORT_IN)
    private readonly finishQuizAttempt: IFinishQuizAttemptPortIn,
    @Inject(GET_MY_QUIZ_RESULT_PORT_IN) private readonly getMyQuizResult: IGetMyQuizResultPortIn,
  ) {}
  @Get('api/quiz-attempts/me')
  @HttpCode(200)
  @ApiOperation({
    summary: 'ListMyQuizAttempts',
    description: 'Authenticated user; only their own learning data.',
  })
  @ApiOkResponse({ type: AttemptPageDto })
  listMyQuizAttemptsRequest(@TrustedPrincipal() p: Principal, @Query() query: QuizPageQueryDto) {
    return this.listMyQuizAttempts.execute(p, query);
  }
  @Get('api/quizzes/:id')
  @HttpCode(200)
  @ApiOperation({
    summary: 'GetPublishedQuiz',
    description: 'Authenticated user; only their own learning data.',
  })
  @ApiOkResponse({ type: QuizIntroDto })
  getPublishedQuizRequest(
    @TrustedPrincipal() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.getPublishedQuiz.execute(p, id.toLowerCase());
  }
  @Get('api/quizzes/:id/completion/me')
  @HttpCode(200)
  @ApiOperation({
    summary: 'GetMyQuizCompletion',
    description: 'Authenticated user; only their own learning data.',
  })
  @ApiOkResponse({ type: CompletionDto })
  getMyQuizCompletionRequest(
    @TrustedPrincipal() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.getMyQuizCompletion.execute(p, id.toLowerCase());
  }
  @Post('api/quizzes/:id/attempts')
  @HttpCode(201)
  @ApiOperation({
    summary: 'StartQuizAttempt',
    description: 'Authenticated user; only their own learning data.',
  })
  @ApiCreatedResponse({ type: LearnerAttemptDto })
  startQuizAttemptRequest(
    @TrustedPrincipal() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() _body: EmptyQuizBodyDto,
  ) {
    return this.startQuizAttempt.execute(p, id.toLowerCase());
  }
  @Get('api/quiz-attempts/:id')
  @HttpCode(200)
  @ApiOperation({
    summary: 'GetMyQuizAttempt',
    description: 'Authenticated user; only their own learning data.',
  })
  @ApiOkResponse({ type: LearnerAttemptDto })
  getMyQuizAttemptRequest(
    @TrustedPrincipal() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.getMyQuizAttempt.execute(p, id.toLowerCase());
  }
  @Put('api/quiz-attempts/:id/answers/:questionId')
  @HttpCode(200)
  @ApiOperation({
    summary: 'AnswerQuizQuestion',
    description: 'Authenticated user; only their own learning data.',
  })
  @ApiOkResponse({ type: QuizFeedbackDto })
  answerQuizQuestionRequest(
    @TrustedPrincipal() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body() body: AnswerDto,
  ) {
    return this.answerQuizQuestion.execute(
      p,
      id.toLowerCase(),
      questionId.toLowerCase(),
      body.selectedOptionId,
    );
  }
  @Post('api/quiz-attempts/:id/finish')
  @HttpCode(200)
  @ApiOperation({
    summary: 'FinishQuizAttempt',
    description: 'Authenticated user; only their own learning data.',
  })
  @ApiOkResponse({ type: QuizSummaryDto })
  finishQuizAttemptRequest(
    @TrustedPrincipal() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() _body: EmptyQuizBodyDto,
  ) {
    return this.finishQuizAttempt.execute(p, id.toLowerCase());
  }
  @Get('api/quiz-attempts/:id/result')
  @HttpCode(200)
  @ApiOperation({
    summary: 'GetMyQuizResult',
    description: 'Authenticated user; only their own learning data.',
  })
  @ApiOkResponse({ type: LearnerAttemptDto })
  getMyQuizResultRequest(@TrustedPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.getMyQuizResult.execute(p, id.toLowerCase());
  }
}
