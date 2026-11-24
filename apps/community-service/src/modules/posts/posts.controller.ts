import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNoContentResponse,
  ApiForbiddenResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { TrustedPrincipal, TrustedUserGuard } from '@/common/auth';
import type { Principal } from '@/common/auth';
import { EditContent } from '@/modules/posts/application';
import {
  CommentPageDto,
  CommentPageQueryDto,
  CreateCommentDto,
  CreatePostDto,
  LikeRequestDto,
  ReactionStateDto,
  PostSummaryDto,
  PostPageQueryDto,
  PostPageDto,
  EditPostDto,
} from '@/modules/posts/dto';
import { PostsService } from '@/modules/posts/posts.service';

@ApiForbiddenResponse({ description: 'Only the author may edit or delete this content.' })
@ApiTags('community')
@ApiBearerAuth()
@ApiBadRequestResponse({ description: 'Invalid request content, post target or UUID.' })
@ApiUnauthorizedResponse({ description: 'Authentication through the API Gateway is required.' })
@Controller('api/community/posts')
@UseGuards(TrustedUserGuard)
export class PostsController {
  constructor(
    private readonly posts: PostsService,
    private readonly edit: EditContent,
  ) {}

  @Get()
  @ApiOkResponse({ type: PostPageDto })
  list(
    @TrustedPrincipal() principal: Principal,
    @Query() query: PostPageQueryDto,
  ): Promise<PostPageDto> {
    return this.posts.list(principal.userId, query);
  }

  @Post()
  create(@TrustedPrincipal() principal: Principal, @Body() dto: CreatePostDto) {
    return this.posts.create(principal.userId, dto);
  }

  @Get(':id')
  @ApiOkResponse({ type: PostSummaryDto })
  get(@TrustedPrincipal() principal: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.posts.get(principal.userId, id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: PostSummaryDto })
  async update(
    @TrustedPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditPostDto,
  ) {
    await this.edit.execute('post', id, principal.userId, dto.content);
    return this.posts.get(principal.userId, id);
  }

  @Delete(':id')
  @ApiNoContentResponse({ description: 'Content was soft deleted.' })
  @HttpCode(204)
  async remove(
    @TrustedPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() _dto: LikeRequestDto,
  ): Promise<void> {
    await this.edit.execute('post', id, principal.userId);
  }

  @Get(':id/comments')
  @ApiOkResponse({ type: CommentPageDto })
  listComments(
    @TrustedPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) postId: string,
    @Query() query: CommentPageQueryDto,
  ): Promise<CommentPageDto> {
    return this.posts.listComments(principal.userId, postId, query);
  }

  @Post(':id/comments')
  comment(
    @TrustedPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) postId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.posts.comment(principal.userId, postId, dto);
  }

  @Put(':id/reactions/like')
  @ApiOkResponse({ type: ReactionStateDto })
  @ApiConflictResponse({ description: 'Hidden posts do not accept new likes.' })
  likePost(
    @TrustedPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) postId: string,
    @Body() _dto: LikeRequestDto,
  ): Promise<ReactionStateDto> {
    return this.posts.setPostLike(principal.userId, postId, true);
  }

  @Delete(':id/reactions/like')
  @ApiOkResponse({ type: ReactionStateDto })
  unlikePost(
    @TrustedPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) postId: string,
    @Body() _dto: LikeRequestDto,
  ): Promise<ReactionStateDto> {
    return this.posts.setPostLike(principal.userId, postId, false);
  }
}
