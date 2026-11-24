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
  forbidden: {
    status: HttpStatus.FORBIDDEN,
    code: 'CONTENT_NOT_OWNED',
    message:
      'B\u1ea1n ch\u1ec9 \u0111\u01b0\u1ee3c s\u1eeda ho\u1eb7c x\u00f3a n\u1ed9i dung c\u1ee7a m\u00ecnh.',
  },
  invalidState: {
    status: HttpStatus.CONFLICT,
    code: 'CONTENT_ALREADY_DELETED',
    message:
      'N\u1ed9i dung \u0111\u00e3 \u0111\u01b0\u1ee3c x\u00f3a. Kh\u00f4ng th\u1ec3 s\u1eeda ho\u1eb7c x\u00f3a l\u1ea1i.',
  },
  commentNotFound: {
    status: HttpStatus.NOT_FOUND,
    code: 'COMMENT_NOT_FOUND',
    message:
      'Kh\u00f4ng t\u00ecm th\u1ea5y b\u00ecnh lu\u1eadn n\u00e0y. H\u00e3y t\u1ea3i l\u1ea1i danh s\u00e1ch b\u00ecnh lu\u1eadn.',
  },
  postInteractionDisabled: {
    status: HttpStatus.CONFLICT,
    code: 'POST_INTERACTION_DISABLED',
    message:
      'B\u00e0i vi\u1ebft \u0111ang b\u1ecb \u1ea9n, kh\u00f4ng th\u1ec3 t\u1ea1o t\u01b0\u01a1ng t\u00e1c m\u1edbi.',
  },
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
