import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';

import { RoleName } from '@/modules/rbac/domain';
import { UserManagementUseCases, type UserManagementRepository } from '@/modules/users/application';
import { QuizShareRecipientController } from '@/modules/users/presentation';

describe('Quiz share recipient internal HTTP contract', () => {
  const userId = '00000000-0000-4000-8000-000000000001';
  const credential = 'test-only-internal-service-credential';
  const user = {
    userId,
    studentId: '123',
    email: 'private@example.test',
    displayName: 'Private name',
    status: 'ACTIVE' as const,
    roles: [RoleName.Lecturer],
    createdAt: new Date(),
    deletedAt: null,
  };
  const repository: jest.Mocked<UserManagementRepository> = {
    list: jest.fn(),
    find: jest.fn().mockResolvedValue(user),
    create: jest.fn(),
    setStatus: jest.fn(),
    softDelete: jest.fn(),
    listStudents: jest.fn(),
  };
  let app: INestApplication;
  let base: string;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [QuizShareRecipientController],
      providers: [
        {
          provide: UserManagementUseCases,
          useValue: new UserManagementUseCases(repository, {
            hash: jest.fn(),
            verify: jest.fn(),
            verifyDummy: jest.fn(),
          }),
        },
        {
          provide: ConfigService,
          useValue: new ConfigService({ INTERNAL_SERVICE_SECRET: credential }),
        },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => jest.clearAllMocks());
  it('requires the internal credential before reading user data', async () => {
    for (const secret of ['', 'wrong', 'x'.repeat(credential.length)]) {
      const res = await fetch(`${base}/internal/users/${userId}/roles`, {
        headers: { 'x-internal-service-secret': secret },
      });
      expect(res.status).toBe(401);
    }
    expect(repository.find).not.toHaveBeenCalled();
  });
  it('returns only userId and roles, the contract consumed by Learning', async () => {
    const res = await fetch(`${base}/internal/users/${userId}/roles`, {
      headers: { 'x-internal-service-secret': credential },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId, roles: ['LECTURER'] });
    const document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
    expect(document.paths).toEqual({});
  });
  it('does not return inactive, deleted or nonexistent users', async () => {
    for (const state of [
      null,
      { ...user, status: 'LOCKED' as const },
      { ...user, deletedAt: new Date() },
    ]) {
      repository.find.mockResolvedValueOnce(state);
      const res = await fetch(`${base}/internal/users/${userId}/roles`, {
        headers: { 'x-internal-service-secret': credential },
      });
      expect(res.status).toBe(404);
    }
  });
});
