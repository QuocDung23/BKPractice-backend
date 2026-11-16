import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { UserManagementUseCases } from '@/modules/users/application';
import { StudentRosterController } from '@/modules/users/presentation/student-roster.controller';

const userId = '00000000-0000-4000-8000-000000000001';

describe('Internal Student roster HTTP', () => {
  let app: INestApplication;
  let baseUrl: string;
  const users = {
    listStudents: jest.fn().mockResolvedValue({
      items: [{ userId, studentId: '001', displayName: 'An' }],
      page: 1,
      limit: 20,
      hasMore: false,
    }),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [StudentRosterController],
      providers: [
        { provide: UserManagementUseCases, useValue: users },
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
  beforeEach(() => users.listStudents.mockClear());

  it('requires exact internal secret and returns the paged minimal roster', async () => {
    const path = `${baseUrl}/internal/users/students?page=1&limit=20`;
    expect((await fetch(path)).status).toBe(401);
    expect((await fetch(path, { headers: { 'x-internal-service-secret': 'wrong' } })).status).toBe(
      401,
    );
    const response = await fetch(path, { headers: { 'x-internal-service-secret': 'test-secret' } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: [{ userId, studentId: '001', displayName: 'An' }],
      page: 1,
      limit: 20,
      hasMore: false,
    });
    expect(users.listStudents).toHaveBeenCalledWith(1, 20);
  });
});
