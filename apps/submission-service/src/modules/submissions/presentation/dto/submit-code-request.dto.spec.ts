import { BadRequestException, ValidationPipe } from '@nestjs/common';

import { SubmitCodeRequestDto } from './submit-code-request.dto';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

const validBody = {
  problemId: '6832170d-de82-41f7-a82c-57b71efbf55c',
  language: 'python',
  sourceCode: 'print(1)',
};

function validate(payload: unknown): Promise<unknown> {
  return pipe.transform(payload, { type: 'body', metatype: SubmitCodeRequestDto });
}

describe('SubmitCodeRequestDto', () => {
  it('accepts a problem, a supported language and source code', async () => {
    await expect(validate(validBody)).resolves.toMatchObject(validBody);
  });

  it('accepts a seeded practice problem with a UUID v5', async () => {
    const payload = { ...validBody, problemId: '79362fb9-18e0-583a-873f-fe78e57158b1' };

    await expect(validate(payload)).resolves.toMatchObject(payload);
  });

  it.each([
    ['owner', { ownerId: crypto.randomUUID() }],
    ['userId', { userId: crypto.randomUUID() }],
    ['roles', { roles: ['ADMIN'] }],
    ['permissions', { permissions: ['submission:admin'] }],
    ['test cases', { testCases: [{ input: '1', expectedOutput: '1' }] }],
    ['time limit', { timeLimitMs: 1 }],
    ['status', { status: 'ACCEPTED' }],
    ['score', { score: 100 }],
  ])('rejects a body that sets the %s', async (_field, extra) => {
    await expect(validate({ ...validBody, ...extra })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unsupported language or a non-UUID problem', async () => {
    await expect(validate({ ...validBody, language: 'ruby' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(validate({ ...validBody, problemId: 'not-a-uuid' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
