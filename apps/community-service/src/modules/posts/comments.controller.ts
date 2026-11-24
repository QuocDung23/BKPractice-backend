import {
  Body,
  Delete,
  Patch,
  HttpCode,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNoContentResponse,
  ApiForbiddenResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { TrustedPrincipal, TrustedUserGuard } from '@/common/auth';
import type { Principal } from '@/common/auth';
import { EditContent } from '@/modules/posts/application';
import { EditCommentDto, EditedCommentDto, LikeRequestDto } from '@/modules/posts/dto';
import { CommentPageQueryDto, ReplyPageDto } from '@/modules/posts/dto';
import { PostsService } from '@/modules/posts/posts.service';

@ApiForbiddenResponse({ description: 'Only the author may edit or delete this content.' })
@ApiTags('community')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Authentication through the API Gateway is required.' })
@ApiBadRequestResponse({ description: 'Invalid comment UUID or page query.' })
@ApiNotFoundResponse({ description: 'Root comment does not exist or is not visible.' })
@Controller('api/community/comments')
@UseGuards(TrustedUserGuard)
export class CommentsController {
  constructor(
    private readonly posts: PostsService,
    private readonly edit: EditContent,
  ) {}

  @Patch(':commentId')
  @ApiOkResponse({ type: EditedCommentDto })
  async update(
    @TrustedPrincipal() principal: Principal,
    @Param('commentId', ParseUUIDPipe) id: string,
    @Body() dto: EditCommentDto,
  ) {
    const comment = await this.edit.execute('comment', id, principal.userId, dto.content);
    return {
      id: comment.id,
      postId: comment.postId,
      parentCommentId: comment.parentCommentId,
      authorId: comment.authorId,
      content: comment.content,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      editedAt: comment.editedAt,
      deletedAt: comment.deletedAt,
      moderation: { status: comment.isHidden ? 'HIDDEN' : 'VISIBLE' },
    };
  }

  @Delete(':commentId')
  @ApiNoContentResponse({ description: 'Content was soft deleted.' })
  @HttpCode(204)
  async remove(
    @TrustedPrincipal() principal: Principal,
    @Param('commentId', ParseUUIDPipe) id: string,
    @Body() _dto: LikeRequestDto,
  ): Promise<void> {
    await this.edit.execute('comment', id, principal.userId);
  }

  @Get(':commentId/replies')
  @ApiOkResponse({ type: ReplyPageDto })
  listReplies(
    @TrustedPrincipal() principal: Principal,
    @Param('commentId', ParseUUIDPipe) rootId: string,
    @Query() query: CommentPageQueryDto,
  ): Promise<ReplyPageDto> {
    return this.posts.listReplies(principal.userId, rootId, query);
  }
}
