import { issueCsrfToken } from '@app/common';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';

import { BK_TOKEN_SERVICE, REFRESH_SESSION_REPOSITORY } from '@/modules/auth/application';
import { AuthFailure } from '@/modules/auth/domain';
import { IdentityAccessAuthenticator } from '@/modules/auth/presentation';
import { RoleName } from '@/modules/rbac/domain';
import { UserManagementUseCases, type UserManagementRepository } from '@/modules/users/application';
import { UserManagementController } from '@/modules/users/presentation';

describe('User administration HTTP', () => {
  let app: INestApplication;
  let baseUrl: string;
  const userId = '00000000-0000-0000-0000-000000000001';
  const user = {
    userId,
    studentId: '123',
    email: 'student@example.test',
    displayName: 'Dũng',
    status: 'ACTIVE' as const,
    roles: [RoleName.Student],
    createdAt: new Date('2026-01-01'),
    deletedAt: null,
  };
  const repository: jest.Mocked<UserManagementRepository> = {
    list: jest.fn().mockResolvedValue({ items: [user], hasMore: false }),
    find: jest.fn().mockResolvedValue(user),
    softDelete: jest.fn().mockResolvedValue(undefined),
    create: jest.fn().mockResolvedValue(user),
    setStatus: jest.fn().mockResolvedValue(user),
    listStudents: jest.fn().mockResolvedValue({ items: [], hasMore: false }),
  };
  const tokens = {
    verifyAccessClaims: jest.fn(async (token: string) => {
      if (token === 'invalid') throw new AuthFailure('invalid_token');
      return {
        sub: 'admin-id',
        sid: 'session-id',
        roles: token === 'student' ? [RoleName.Student] : [RoleName.Admin],
        permissions:
          token === 'read'
            ? ['user:read']
            : token === 'delete'
              ? ['user:delete']
              : token === 'create'
                ? ['user:create']
                : token === 'status'
                  ? ['user:status']
                  : [],
      };
    }),
  };
  const sessions = { isActive: jest.fn().mockResolvedValue(true) };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [UserManagementController],
      providers: [
        IdentityAccessAuthenticator,
        {
          provide: UserManagementUseCases,
          useValue: new UserManagementUseCases(repository, {
            hash: async () => 'hash',
            verify: async () => true,
            verifyDummy: async () => undefined,
          }),
        },
        { provide: BK_TOKEN_SERVICE, useValue: tokens },
        { provide: REFRESH_SESSION_REPOSITORY, useValue: sessions },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            CORS_ORIGINS: 'https://app.example',
            JWT_ACCESS_SECRET: 'a'.repeat(32),
          }),
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
    if (app) await app.close();
  });
  beforeEach(() => jest.clearAllMocks());

  it('requires ADMIN and user:read for pages/details and validates queries', async () => {
    const path = `${baseUrl}/api/admin/users`;
    expect((await fetch(path)).status).toBe(401);
    expect((await fetch(path, { headers: { authorization: 'Bearer student' } })).status).toBe(403);
    expect((await fetch(path, { headers: { authorization: 'Bearer delete' } })).status).toBe(403);
    const page = await fetch(`${path}?page=2&limit=5&includeDeleted=true`, {
      headers: { authorization: 'Bearer read' },
    });
    expect(page.status).toBe(200);
    expect(await page.json()).toEqual({
      items: [{ ...user, createdAt: user.createdAt.toISOString() }],
      page: 2,
      limit: 5,
      hasMore: false,
    });
    expect(repository.list).toHaveBeenCalledWith(2, 5, true, {});
    for (const query of ['page=0', 'limit=51', 'includeDeleted=yes', 'email=x']) {
      expect(
        (await fetch(`${path}?${query}`, { headers: { authorization: 'Bearer read' } })).status,
      ).toBe(400);
    }
    expect(
      (await fetch(`${path}/bad-id`, { headers: { authorization: 'Bearer read' } })).status,
    ).toBe(400);
    const deleted = { ...user, deletedAt: new Date('2026-02-01') };
    repository.find.mockResolvedValueOnce(deleted);
    const detail = await fetch(`${path}/${userId}`, { headers: { authorization: 'Bearer read' } });
    expect(detail.status).toBe(200);
    expect(((await detail.json()) as { deletedAt: string }).deletedAt).toBe(
      deleted.deletedAt.toISOString(),
    );
    repository.find.mockResolvedValueOnce(null);
    expect(
      (await fetch(`${path}/${userId}`, { headers: { authorization: 'Bearer read' } })).status,
    ).toBe(404);
  });

  it('requires ADMIN and user:delete; cookie DELETE also requires Origin and CSRF', async () => {
    const path = `${baseUrl}/api/admin/users/${userId}`;
    expect(
      (
        await fetch(path, {
          method: 'DELETE',
          headers: { authorization: 'Bearer read', 'content-type': 'application/json' },
          body: JSON.stringify({ reason: 'Policy violation' }),
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(path, {
          method: 'DELETE',
          headers: { authorization: 'Bearer delete', 'content-type': 'application/json' },
          body: JSON.stringify({ reason: 'Policy violation' }),
        })
      ).status,
    ).toBe(204);
    const csrf = issueCsrfToken('session-id', 'a'.repeat(32));
    const cookie = `__Host-bk_access=delete; __Host-bk_csrf=${csrf}`;
    expect(
      (
        await fetch(path, {
          method: 'DELETE',
          headers: { cookie, 'content-type': 'application/json' },
          body: JSON.stringify({ reason: 'Policy violation' }),
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(path, {
          method: 'DELETE',
          headers: {
            cookie,
            origin: 'https://app.example',
            'x-csrf-token': csrf,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ reason: 'Policy violation' }),
        })
      ).status,
    ).toBe(204);
    expect(repository.softDelete).toHaveBeenCalledTimes(2);
  });

  it('creates a managed account and changes status through verified Admin permissions', async () => {
    const path = `${baseUrl}/api/admin/users`;
    const input = {
      studentId: '123456',
      displayName: 'An',
      email: 'an@sv1.dut.udn.vn',
      password: 'Secret123',
      role: 'STUDENT',
      reason: 'Enrollment',
    };
    const create = await fetch(path, {
      method: 'POST',
      headers: { authorization: 'Bearer create', 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    expect(create.status).toBe(201);
    expect((await create.json()) as Record<string, unknown>).not.toHaveProperty('passwordHash');
    expect(repository.create).toHaveBeenCalledWith(
      'admin-id',
      expect.objectContaining({
        email: input.email,
        passwordHash: 'hash',
        role: RoleName.Student,
      }),
    );
    expect(
      (
        await fetch(path, {
          method: 'POST',
          headers: { authorization: 'Bearer read', 'content-type': 'application/json' },
          body: JSON.stringify(input),
        })
      ).status,
    ).toBe(403);
    const statusPath = `${path}/${userId}/status`;
    expect(
      (
        await fetch(statusPath, {
          method: 'PATCH',
          headers: { authorization: 'Bearer status', 'content-type': 'application/json' },
          body: JSON.stringify({ status: 'LOCKED', reason: 'Security review' }),
        })
      ).status,
    ).toBe(200);
    expect(repository.setStatus).toHaveBeenCalledWith(
      'admin-id',
      userId,
      'LOCKED',
      'Security review',
    );
    expect(
      (
        await fetch(statusPath, {
          method: 'PATCH',
          headers: { authorization: 'Bearer status', 'content-type': 'application/json' },
          body: JSON.stringify({ status: 'PENDING', reason: 'Invalid' }),
        })
      ).status,
    ).toBe(400);
  });

  it('documents only the three admin routes and allowlisted projection', () => {
    const document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
    expect(document.paths['/api/admin/users']?.get).toBeDefined();
    expect(document.paths['/api/admin/users/{userId}']?.get).toBeDefined();
    expect(document.paths['/api/admin/users/{userId}']?.delete).toBeDefined();
    const schema = document.components?.schemas?.UserAdminResponseDto;
    expect(Object.keys(schema && 'properties' in schema ? (schema.properties ?? {}) : {})).toEqual([
      'userId',
      'studentId',
      'email',
      'displayName',
      'status',
      'roles',
      'createdAt',
      'deletedAt',
    ]);
  });
});
