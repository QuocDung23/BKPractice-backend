import {
  LIST_TOPICS_PORT_IN,
  type IListTopicsPortIn,
} from '@learning/modules/problems/application/ports/in/list-topics.port.in';
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
import { TopicListResponseDto } from './dto/topic-list-response.dto';
import { ProblemExceptionFilter } from './filters/problem-exception.filter';
import { TrustedPrincipalGuard } from './guards/trusted-principal.guard';

@ApiTags('topics')
@ApiBearerAuth()
@UseFilters(ProblemExceptionFilter)
@UseGuards(TrustedPrincipalGuard)
@Controller('api/topics')
export class PublicTopicsController {
  constructor(
    @Inject(LIST_TOPICS_PORT_IN)
    private readonly listTopics: IListTopicsPortIn,
  ) {}

  @Get()
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
}
