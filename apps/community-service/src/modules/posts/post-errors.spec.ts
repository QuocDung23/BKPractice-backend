import { POST_ERRORS, createPostError } from './post-errors';

describe('POST_ERRORS', () => {
  it.each([
    ['postNotFound', 404, 'POST_NOT_FOUND'],
    ['commentParentNotFound', 404, 'COMMENT_PARENT_NOT_FOUND'],
    ['commentReplyDepthExceeded', 422, 'COMMENT_REPLY_DEPTH_EXCEEDED'],
  ] as const)('%s keeps its historical status and stable code', (key, status, code) => {
    const error = createPostError(POST_ERRORS[key]);
    expect(error.getStatus()).toBe(status);
    expect(error.code).toBe(code);
    expect(error.message).toMatch(/[ăâêôơưđ]/i);
  });

  it('gives every error a distinct code', () => {
    const codes = Object.values(POST_ERRORS).map((definition) => definition.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
