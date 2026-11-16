import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import {
  CourseReportForbiddenError,
  GetStudentCourseReportUseCase,
} from '@/modules/progress/application/reports/get-student-course-report.use-case';
import { RemoteReportUnavailableError } from '@/modules/progress/infrastructure/reports/remote-course-report.reader';
import { StudentCourseReportController } from '@/modules/progress/presentation/http/student-course-report.controller';

const userId = '00000000-0000-4000-8000-000000000001';
const courseId = '00000000-0000-4000-8000-000000000002';
const report = { items: [], page: 1, limit: 20, hasMore: false, courseId };

describe('Student Course report HTTP', () => {
  let app: INestApplication;
  let baseUrl: string;
  const useCase = { execute: jest.fn().mockResolvedValue(report) };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [StudentCourseReportController],
      providers: [{ provide: GetStudentCourseReportUseCase, useValue: useCase }],
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
  beforeEach(() => {
    useCase.execute.mockReset().mockResolvedValue(report);
  });

  const get = (path: string, role = 'LECTURER') =>
    fetch(`${baseUrl}${path}`, {
      headers: {
        'x-auth-user-id': userId,
        'x-auth-roles': role,
        'x-auth-permissions': 'course:read-managed',
      },
    });

  it('routes verified principal and pagination to the report use case', async () => {
    const response = await get(`/api/progress/courses/${courseId}/students?page=1&limit=20`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(report);
    expect(useCase.execute).toHaveBeenCalledWith(
      { userId, roles: ['LECTURER'], permissions: ['course:read-managed'] },
      courseId,
      1,
      20,
    );
  });

  it('validates ID/query and maps ownership and upstream failures', async () => {
    expect((await get(`/api/progress/courses/bad/students`)).status).toBe(400);
    expect((await get(`/api/progress/courses/${courseId}/students?limit=101`)).status).toBe(400);
    useCase.execute.mockRejectedValueOnce(new CourseReportForbiddenError());
    expect((await get(`/api/progress/courses/${courseId}/students`)).status).toBe(403);
    useCase.execute.mockRejectedValueOnce(new RemoteReportUnavailableError());
    expect((await get(`/api/progress/courses/${courseId}/students`)).status).toBe(503);
  });
});
