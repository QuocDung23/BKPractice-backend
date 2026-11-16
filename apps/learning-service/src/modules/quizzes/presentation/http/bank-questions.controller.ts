import {
  Body,
  Controller,
  Delete,
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
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { TrustedPrincipal } from '@/modules/problems/presentation/http/decorators/trusted-principal.decorator';
import { TrustedPrincipalGuard } from '@/modules/problems/presentation/http/guards/trusted-principal.guard';
import {
  CLONE_QUESTION_PORT_IN,
  type ICloneQuestionPortIn,
  CREATE_QUESTION_PORT_IN,
  type ICreateQuestionPortIn,
  DELETE_QUESTION_PORT_IN,
  type IDeleteQuestionPortIn,
  GET_BANK_QUESTION_PORT_IN,
  type IGetBankQuestionPortIn,
  LIST_BANK_QUESTIONS_PORT_IN,
  type IListBankQuestionsPortIn,
  LIST_QUESTION_USAGE_PORT_IN,
  type IListQuestionUsagePortIn,
  RESTORE_QUESTION_PORT_IN,
  type IRestoreQuestionPortIn,
  REVISE_QUESTION_PORT_IN,
  type IReviseQuestionPortIn,
  SHARE_QUESTION_PORT_IN,
  type IShareQuestionPortIn,
  SET_QUESTION_VISIBILITY_PORT_IN,
  type ISetQuestionVisibilityPortIn,
} from '@/modules/quizzes/application/ports/in';
import type { Principal } from '@/modules/quizzes/domain';
import { IdempotencyKey } from '@/modules/quizzes/presentation/http/decorators';
import {
  BankQuestionPageDto,
  CreateQuestionDto,
  ManagedQuestionDto,
  QuestionInputDto,
  QuizPageQueryDto,
  QuizUsageDto,
  QuestionVisibilityDto,
  ShareDto,
} from '@/modules/quizzes/presentation/http/dto';
import { QuizExceptionFilter } from '@/modules/quizzes/presentation/http/quiz-exception.filter';

@ApiTags('bank-questions')
@ApiBearerAuth()
@ApiBadRequestResponse()
@ApiForbiddenResponse()
@ApiNotFoundResponse()
@ApiConflictResponse()
@ApiUnauthorizedResponse()
@UseGuards(TrustedPrincipalGuard)
@UseFilters(QuizExceptionFilter)
@Controller('api/question-bank/questions')
export class BankQuestionsController {
  constructor(
    @Inject(LIST_BANK_QUESTIONS_PORT_IN)
    private readonly listBankQuestions: IListBankQuestionsPortIn,
    @Inject(CREATE_QUESTION_PORT_IN) private readonly createQuestion: ICreateQuestionPortIn,
    @Inject(GET_BANK_QUESTION_PORT_IN) private readonly getBankQuestion: IGetBankQuestionPortIn,
    @Inject(LIST_QUESTION_USAGE_PORT_IN)
    private readonly listQuestionUsage: IListQuestionUsagePortIn,
    @Inject(REVISE_QUESTION_PORT_IN) private readonly reviseQuestion: IReviseQuestionPortIn,
    @Inject(SHARE_QUESTION_PORT_IN) private readonly shareQuestion: IShareQuestionPortIn,
    @Inject(SET_QUESTION_VISIBILITY_PORT_IN)
    private readonly setQuestionVisibility: ISetQuestionVisibilityPortIn,
    @Inject(CLONE_QUESTION_PORT_IN) private readonly cloneQuestion: ICloneQuestionPortIn,
    @Inject(DELETE_QUESTION_PORT_IN) private readonly deleteQuestion: IDeleteQuestionPortIn,
    @Inject(RESTORE_QUESTION_PORT_IN) private readonly restoreQuestion: IRestoreQuestionPortIn,
  ) {}
  @Get('')
  @HttpCode(200)
  @ApiOperation({
    summary: 'ListBankQuestions',
    description: 'Lists shared questions and private questions available to the caller.',
  })
  @ApiOkResponse({ type: BankQuestionPageDto })
  listBankQuestionsRequest(@TrustedPrincipal() p: Principal, @Query() query: QuizPageQueryDto) {
    return this.listBankQuestions.execute(p, query);
  }
  @Post('')
  @HttpCode(201)
  @ApiOperation({
    summary: 'CreateQuestion',
    description: 'Creates a shared question by default; set isPrivate=true to restrict its use.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'UUID reused only when retrying the same create operation.',
  })
  @ApiCreatedResponse({ type: ManagedQuestionDto })
  createQuestionRequest(
    @TrustedPrincipal() p: Principal,
    @IdempotencyKey(new ParseUUIDPipe()) idempotencyKey: string,
    @Body() body: CreateQuestionDto,
  ) {
    return this.createQuestion.execute(p, {
      content: body.content,
      explanation: body.explanation,
      options: body.options,
      difficulty: body.difficulty,
      topicIds: body.topicIds,
      tagIds: body.tagIds,
      isPrivate: body.isPrivate,
      clientRequestId: idempotencyKey.toLowerCase(),
    });
  }
  @Get(':id')
  @HttpCode(200)
  @ApiOperation({
    summary: 'GetBankQuestion',
    description: 'Requires management role, action permission and ownership/sharing scope.',
  })
  @ApiOkResponse({ type: ManagedQuestionDto })
  getBankQuestionRequest(@TrustedPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.getBankQuestion.execute(p, id.toLowerCase());
  }
  @Get(':id/usage')
  @HttpCode(200)
  @ApiOperation({
    summary: 'ListQuestionUsage',
    description: 'Requires management role, action permission and ownership/sharing scope.',
  })
  @ApiOkResponse({ type: QuizUsageDto, isArray: true })
  listQuestionUsageRequest(
    @TrustedPrincipal() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.listQuestionUsage.execute(p, id.toLowerCase());
  }
  @Post(':id/revisions')
  @HttpCode(201)
  @ApiOperation({
    summary: 'ReviseQuestion',
    description: 'Requires management role, action permission and ownership/sharing scope.',
  })
  @ApiCreatedResponse({ type: ManagedQuestionDto })
  reviseQuestionRequest(
    @TrustedPrincipal() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: QuestionInputDto,
  ) {
    return this.reviseQuestion.execute(p, id.toLowerCase(), body);
  }
  @Put(':id/shares')
  @HttpCode(200)
  @ApiOperation({
    summary: 'ShareQuestion',
    description: 'Requires management role, action permission and ownership/sharing scope.',
  })
  @ApiOkResponse({ description: 'Completed; empty response body.' })
  shareQuestionRequest(
    @TrustedPrincipal() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ShareDto,
  ) {
    return this.shareQuestion.execute(p, id.toLowerCase(), body);
  }
  @Put(':id/visibility')
  @HttpCode(200)
  @ApiOperation({
    summary: 'SetQuestionVisibility',
    description: 'Owner or ADMIN can make a question shared with lecturers or private.',
  })
  @ApiOkResponse({ type: ManagedQuestionDto })
  setQuestionVisibilityRequest(
    @TrustedPrincipal() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: QuestionVisibilityDto,
  ) {
    return this.setQuestionVisibility.execute(p, id.toLowerCase(), body.isPrivate);
  }
  @Post(':id/clone')
  @HttpCode(201)
  @ApiOperation({
    summary: 'CloneQuestion',
    description: 'Requires management role, action permission and ownership/sharing scope.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'UUID reused only when retrying the same clone operation.',
  })
  @ApiCreatedResponse({ type: ManagedQuestionDto })
  cloneQuestionRequest(
    @TrustedPrincipal() p: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @IdempotencyKey(new ParseUUIDPipe()) idempotencyKey: string,
  ) {
    return this.cloneQuestion.execute(p, id.toLowerCase(), idempotencyKey.toLowerCase());
  }
  @Delete(':id')
  @HttpCode(200)
  @ApiOperation({
    summary: 'DeleteQuestion',
    description: 'Requires management role, action permission and ownership/sharing scope.',
  })
  @ApiOkResponse({ type: ManagedQuestionDto })
  deleteQuestionRequest(@TrustedPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.deleteQuestion.execute(p, id.toLowerCase());
  }
  @Post(':id/restore')
  @HttpCode(200)
  @ApiOperation({
    summary: 'RestoreQuestion',
    description: 'Requires management role, action permission and ownership/sharing scope.',
  })
  @ApiOkResponse({ type: ManagedQuestionDto })
  restoreQuestionRequest(@TrustedPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.restoreQuestion.execute(p, id.toLowerCase());
  }
}
