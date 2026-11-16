import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { CountCourseSubmissionsUseCase } from '../application/count-course-submissions.use-case';

import { InternalSubmissionCountsController } from './internal-submission-counts.controller';

const userId = '00000000-0000-4000-8000-000000000001';
const problemId = '00000000-0000-4000-8000-000000000002';

describe('Internal submission counts HTTP', () => {
  let app: INestApplication;
  let baseUrl: string;
  const counts = { execute: jest.fn().mockResolvedValue([{ userId, problemId, count: 2 }]) };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [InternalSubmissionCountsController],
      providers: [
        { provide: CountCourseSubmissionsUseCase, useValue: counts },
        {
          provide: ConfigService,
          useValue: new ConfigService({ INTERNAL_SERVICE_SECRET: 'test-secret' }),
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => counts.execute.mockClear());

  const post = (secret: string | undefined, body: unknown) =>
    fetch(`${baseUrl}/internal/submissions/counts`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(secret ? { 'x-internal-service-secret': secret } : {}),
      },
      body: JSON.stringify(body),
    });

  it('rejects callers without the exact internal credential', async () => {
    for (const secret of [undefined, 'wrong', 'test-secreT']) {
      expect((await post(secret, { userIds: [userId], problemIds: [problemId] })).status).toBe(401);
    }
    expect(counts.execute).not.toHaveBeenCalled();
  });

  it('validates IDs and returns saved-submission counts only from its use case', async () => {
    expect((await post('test-secret', { userIds: ['bad'], problemIds: [problemId] })).status).toBe(
      400,
    );
    const response = await post('test-secret', { userIds: [userId], problemIds: [problemId] });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ counts: [{ userId, problemId, count: 2 }] });
    expect(counts.execute).toHaveBeenCalledWith([userId], [problemId]);
  });
});
