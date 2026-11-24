import {
  LIST_TOPICS_PORT_IN,
  type IListTopicsPortIn,
} from '@learning/modules/problems/application/ports/in/list-topics.port.in';
import {
  TagListResponseDto,
  TopicListResponseDto,
} from '@learning/modules/problems/presentation/http/dto/topic-list-response.dto';
import { Controller, Get, Inject, Query, UseFilters, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { ListTopicsQueryDto } from './dto/list-topics-query.dto';
import { ProblemExceptionFilter } from './filters/problem-exception.filter';
import { TrustedPrincipalGuard } from './guards/trusted-principal.guard';

@ApiTags('topics')
@ApiBearerAuth()
@UseFilters(ProblemExceptionFilter)
@UseGuards(TrustedPrincipalGuard)
@Controller('api')
export class PublicTopicsController {
  constructor(
    @Inject(LIST_TOPICS_PORT_IN)
    private readonly listTopics: IListTopicsPortIn,
  ) {}

  @Get('topics')
  @ApiOperation({
    summary: 'List the topic catalog',
    description:
      'Returns every Learning topic ordered by name. The catalog is a read-only dictionary for problem filters: it has no pagination, no Problem metadata and no parameters.',
  })
  @ApiOkResponse({ type: TopicListResponseDto })
  @ApiBadRequestResponse({ description: 'Unsupported query parameters.' })
  @ApiUnauthorizedResponse({ description: 'Missing or malformed trusted principal headers.' })
  async list(@Query() _query: ListTopicsQueryDto): Promise<TopicListResponseDto> {
    const topics = await this.listTopics.execute();

    return { items: [...topics] };
  }

  @Get('tags')
  @ApiOperation({ summary: 'List the tag catalog ordered by name' })
  @ApiOkResponse({ type: TagListResponseDto })
  @ApiBadRequestResponse({ description: 'Unsupported query parameters.' })
  @ApiUnauthorizedResponse({ description: 'Missing or malformed trusted principal headers.' })
  async listTags(@Query() _query: ListTopicsQueryDto): Promise<TagListResponseDto> {
    const tags = await this.listTopics.execute('tags');
    return { items: [...tags] };
  }
}
