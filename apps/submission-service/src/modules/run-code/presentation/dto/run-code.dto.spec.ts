import { BadRequestException, ValidationPipe } from '@nestjs/common';

import { RunCodeDto } from './run-code.dto';

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

function validate(payload: unknown): Promise<unknown> {
  return pipe.transform(payload, { type: 'body', metatype: RunCodeDto });
}

describe('RunCodeDto', () => {
  it('accepts empty stdin and an optional UUID v4 problem label', async () => {
    await expect(
      validate({
        language: 'python',
        sourceCode: 'print(1)',
        stdin: '',
        problemId: '4c030bea-32ce-4ee7-9f57-5b25848e70bc',
      }),
    ).resolves.toMatchObject({ stdin: '' });
  });

  it('accepts the UUID v5 problem label from seeded practice data', async () => {
    const payload = {
      language: 'c',
      sourceCode: '#include <stdio.h>\nint main(void) { return 0; }',
      stdin: '',
      problemId: '52287484-6967-5b6c-b636-1707a3049086',
    };

    await expect(validate(payload)).resolves.toMatchObject(payload);
  });

  it.each([
    [{ language: 'ruby', sourceCode: 'puts 1', stdin: '' }],
    [{ language: 'python', sourceCode: '', stdin: '' }],
    [{ language: 'python', sourceCode: 'x'.repeat(100_001), stdin: '' }],
    [{ language: 'python', sourceCode: 'print(1)', stdin: 'x'.repeat(100_001) }],
    [{ language: 'python', sourceCode: 'print(1)', stdin: '', problemId: 'not-a-uuid' }],
    [
      {
        language: 'python',
        sourceCode: 'print(1)',
        stdin: '',
        problemId: '52287484-6967-3b6c-b636-1707a3049086',
      },
    ],
    [{ language: 'python', sourceCode: 'print(1)', stdin: '', timeLimitMs: 99_999 }],
    [{ language: 'python', sourceCode: 'print(1)', stdin: '', userId: crypto.randomUUID() }],
  ])('rejects invalid or privileged input before the use case runs', async (payload) => {
    await expect(validate(payload)).rejects.toBeInstanceOf(BadRequestException);
  });
});
