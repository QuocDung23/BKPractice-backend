import { AppHttpException } from '@app/common';
import { HttpStatus } from '@nestjs/common';

export interface PostErrorDefinition {
  readonly status: number;
  readonly code: string;
  readonly message: string;
}

/**
 * Mã lỗi HTTP của Community (spec ERR-001 FR-009). Giữ nguyên status đã có từ trước; thông báo nêu nguyên
 * nhân và hướng xử lý, không nhắc tới dữ liệu của người dùng khác.
 */
export const POST_ERRORS = {
  postNotFound: {
    status: HttpStatus.NOT_FOUND,
    code: 'POST_NOT_FOUND',
    message:
      'Không tìm thấy bài viết này. Có thể bài viết đã bị xóa hoặc bị ẩn, hãy tải lại danh sách bài viết rồi thử lại.',
  },
  commentParentNotFound: {
    status: HttpStatus.NOT_FOUND,
    code: 'COMMENT_PARENT_NOT_FOUND',
    message:
      'Không tìm thấy bình luận mà bạn đang trả lời trong bài viết này. Hãy tải lại bài viết rồi thử lại.',
  },
  commentReplyDepthExceeded: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    code: 'COMMENT_REPLY_DEPTH_EXCEEDED',
    message:
      'Chỉ được trả lời bình luận gốc, không thể trả lời tiếp một câu trả lời. Hãy gửi câu trả lời vào bình luận gốc.',
  },
} as const satisfies Record<string, PostErrorDefinition>;

export function createPostError(definition: PostErrorDefinition): AppHttpException {
  return new AppHttpException(definition.status, definition.code, definition.message);
}
