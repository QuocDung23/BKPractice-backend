import type { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { of } from 'rxjs';

import { learningRoutes } from '@/application/proxy/gateway-proxy.constants';
import { GatewayProxyService } from '@/application/proxy/gateway-proxy.service';

// Lỗi đúng định dạng chuẩn nên Gateway chuyển tiếp nguyên vẹn (ERR-001 FR-011).
const QUIZ_CONFLICT = {
  statusCode: 409,
  code: 'QUIZ_CONFLICT',
  message: 'Bài quiz đã bị thay đổi bởi người khác.',
  requestId: 'req-quiz-1',
};

describe('Quiz Gateway contract', () => {
  const config = new ConfigService({
    IDENTITY_SERVICE_URL: 'http://identity.test',
    LEARNING_SERVICE_URL: 'http://learning.test',
    SUBMISSION_SERVICE_URL: 'http://submission.test',
    COMMUNITY_SERVICE_URL: 'http://community.test',
  });
  function fixture(method: string, path: string) {
    const upstream = {
      request: jest.fn().mockReturnValue(of({ status: 409, headers: {}, data: QUIZ_CONFLICT })),
    };
    const response = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), send: jest.fn() };
    const request = {
      method,
      path,
      originalUrl: path,
      headers: {
        authorization: 'Bearer verified',
        'idempotency-key': '3fa85f64-5717-4562-b3fc-2c963f66afa6',
        'x-internal-service-secret': 'untrusted',
        cookie: 'private-cookie',
      },
      body: { selectedOptionId: 'choice' },
    } as unknown as Request;
    return {
      upstream,
      response,
      request,
      service: new GatewayProxyService(upstream as unknown as HttpService, config),
    };
  }
  it.each([
    ['GET', '/api/question-bank/questions'],
    ['POST', '/api/question-bank/questions'],
    ['GET', '/api/question-bank/questions/id/usage'],
    ['POST', '/api/question-bank/questions/id/revisions'],
    ['PUT', '/api/question-bank/questions/id/shares'],
    ['PUT', '/api/question-bank/questions/id/visibility'],
    ['POST', '/api/question-bank/questions/id/clone'],
    ['DELETE', '/api/question-bank/questions/id'],
    ['POST', '/api/question-bank/questions/id/restore'],
    ['GET', '/api/quizzes/managed'],
    ['GET', '/api/quizzes/managed/id'],
    ['POST', '/api/quizzes'],
    ['PATCH', '/api/quizzes/id/draft'],
    ['PUT', '/api/quizzes/id/draft/questions'],
    ['POST', '/api/quizzes/id/preview'],
    ['POST', '/api/quizzes/id/publish'],
    ['PUT', '/api/quizzes/id/shares'],
    ['POST', '/api/quizzes/id/clone'],
    ['POST', '/api/quizzes/id/hold'],
    ['POST', '/api/quizzes/id/republish'],
    ['DELETE', '/api/quizzes/id'],
    ['POST', '/api/quizzes/id/restore'],
    ['GET', '/api/quizzes/id'],
    ['POST', '/api/quizzes/id/attempts'],
    ['GET', '/api/quizzes/id/completion/me'],
    ['GET', '/api/quiz-attempts/me'],
    ['GET', '/api/quiz-attempts/id'],
    ['GET', '/api/quiz-attempts/id/result'],
    ['PUT', '/api/quiz-attempts/id/answers/question'],
    ['POST', '/api/quiz-attempts/id/finish'],
    ['POST', '/api/courses/id/chapters/chapter/quizzes'],
    ['PUT', '/api/courses/id/chapters/chapter/quizzes/order'],
    ['DELETE', '/api/courses/id/chapters/chapter/quizzes/quiz'],
  ])('forwards %s %s and preserves upstream errors', async (method, path) => {
    const f = fixture(method, path);
    f.request.originalUrl += '?page=2';
    await f.service.forward(f.request, f.response as unknown as Response);
    expect(f.upstream.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method,
        url: 'http://learning.test' + path + '?page=2',
        headers: {
          authorization: 'Bearer verified',
          'idempotency-key': '3fa85f64-5717-4562-b3fc-2c963f66afa6',
        },
        data: f.request.body as unknown,
      }),
    );
    expect(f.response.status).toHaveBeenCalledWith(409);
    expect(f.response.send).toHaveBeenCalledWith(QUIZ_CONFLICT);
  });
  it.each([
    ['PATCH', '/api/question-bank/questions/id'],
    ['GET', '/api/quizzes/id/answers'],
    ['GET', '/api/quiz-attempts/id/answers/question'],
    ['GET', '/internal/users/id/roles'],
    ['POST', '/api/quizzes/id/finish/extra'],
    ['POST', '/api/quizzes-malicious/id/attempts'],
    ['POST', '/api/quizzes/id/%252e%252e/attempts'],
    ['POST', '/api/quizzes/id%2Fattempts'],
  ])('rejects %s %s before calling an upstream', async (method, path) => {
    const f = fixture(method, path);
    await expect(f.service.forward(f.request, f.response as unknown as Response)).rejects.toThrow();
    expect(f.upstream.request).not.toHaveBeenCalled();
  });
  it('has no unbounded Quiz route wildcard', () => {
    expect(
      learningRoutes.some(
        ([method, path]) => method === 'GET' && path.test('/api/quizzes/id/internal/private'),
      ),
    ).toBe(false);
  });
});
