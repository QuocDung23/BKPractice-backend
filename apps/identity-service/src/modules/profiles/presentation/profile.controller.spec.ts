import { issueCsrfToken } from '@app/common';
import { Logger, ValidationPipe } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

import type { BkTokenService, RefreshSessionRepository } from '@/modules/auth/application';
import { AuthFailure } from '@/modules/auth/domain';
import { IdentityAccessAuthenticator } from '@/modules/auth/presentation';
import type { ProfileUseCases } from '@/modules/profiles/application';
import { ProfileFailure } from '@/modules/profiles/domain';
import {
  ProfileController,
  ProfileFailureFilter,
  SearchProfilesQueryDto,
  UpdateProfileDto,
} from '@/modules/profiles/presentation';
import { RoleName } from '@/modules/rbac/domain';

describe('Profile HTTP contract', () => {
  const publicProfile = { displayName: 'Tên', avatar: null, bio: null };
  const privateProfile = { userId: 'user-id', ...publicProfile };
  const useCases = {
    getMy: jest.fn(async () => privateProfile),
    updateMy: jest.fn(async () => privateProfile),
    getPublic: jest.fn(async () => publicProfile),
    searchProfiles: jest.fn(async () => ({ items: [], page: 1, limit: 20, hasMore: false })),
    adminGet: jest.fn(async () => privateProfile),
    adminUpdate: jest.fn(async () => privateProfile),
    createAvatarUploadIntent: jest.fn(),
  } as unknown as ProfileUseCases;
  const tokens = {
    verifyAccessClaims: jest.fn(async (token: string) => {
      if (token === 'invalid') throw new AuthFailure('invalid_token');
      return {
        sub: 'user-id',
        sid: 'session-id',
        roles:
          token === 'admin'
            ? [RoleName.Admin]
            : token === 'lecturer'
              ? [RoleName.Lecturer]
              : token === 'no-role'
                ? []
                : [RoleName.Student],
        permissions: [],
      };
    }),
  } as unknown as BkTokenService;
  const sessions = {
    isActive: jest.fn().mockResolvedValue(true),
  } as unknown as RefreshSessionRepository;
  const access = new IdentityAccessAuthenticator(
    tokens,
    sessions,
    new ConfigService({ CORS_ORIGINS: 'http://localhost:3006', JWT_ACCESS_SECRET: 'a'.repeat(32) }),
  );
  const controller = new ProfileController(useCases, access);
  const request = (method: string, authorization?: string, cookie?: string, csrf?: string) => {
    const headers: Record<string, string | undefined> = {
      authorization,
      cookie,
      origin: 'http://localhost:3006',
      'x-csrf-token': csrf,
    };
    return { method, header: (name: string) => headers[name] } as Request;
  };

  beforeEach(() => jest.clearAllMocks());

  it('requires an access token for private operations and never accepts a caller-supplied owner ID', async () => {
    await expect(controller.getMy(request('GET'))).rejects.toThrow('invalid_token');
    await expect(controller.updateMy(request('PATCH'), {})).rejects.toThrow('invalid_token');
    expect(await controller.getMy(request('GET', 'Bearer student'))).toEqual(privateProfile);
    expect(useCases.getMy).toHaveBeenCalledWith('user-id');
  });

  it('requires an active session to search and applies pagination defaults', async () => {
    await expect(controller.searchProfiles(request('GET'), { q: 'An' })).rejects.toThrow(
      'invalid_token',
    );
    expect(useCases.searchProfiles).not.toHaveBeenCalled();
    expect(await controller.searchProfiles(request('GET', 'Bearer student'), { q: 'An' })).toEqual({
      items: [],
      page: 1,
      limit: 20,
      hasMore: false,
    });
    expect(useCases.searchProfiles).toHaveBeenCalledWith('An', 1, 20);
    await controller.searchProfiles(request('GET', 'Bearer lecturer'), { q: 'An' });
    await controller.searchProfiles(request('GET', 'Bearer admin'), { q: 'An' });
    expect(useCases.searchProfiles).toHaveBeenCalledTimes(3);
    await expect(
      controller.searchProfiles(request('GET', 'Bearer no-role'), { q: 'An' }),
    ).rejects.toThrow('invalid_token');
    await controller.searchProfiles(request('GET', undefined, '__Host-bk_access=student'), {
      q: 'Bình',
      page: '2',
      limit: '5',
    });
    expect(useCases.searchProfiles).toHaveBeenCalledWith('Bình', 2, 5);
    jest.mocked(sessions.isActive).mockResolvedValueOnce(false);
    await expect(
      controller.searchProfiles(request('GET', 'Bearer student'), { q: 'An' }),
    ).rejects.toThrow('invalid_token');
  });

  it('validates search query shape at the HTTP boundary', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    const metadata = { type: 'query' as const, metatype: SearchProfilesQueryDto };
    await expect(
      pipe.transform({ q: 'An', page: '2', limit: '50' }, metadata),
    ).resolves.toMatchObject({ q: 'An', page: '2', limit: '50' });
    for (const query of [
      {},
      { q: 'An', page: '0' },
      { q: 'An', limit: '51x' },
      { q: 'An', email: 'x' },
    ]) {
      await expect(pipe.transform(query, metadata)).rejects.toThrow();
    }
  });

  it('logs search duration without the searched name or an unsafe request ID', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const incoming = {
      method: 'GET',
      header: (name: string) =>
        name === 'authorization'
          ? 'Bearer student'
          : name === 'x-request-id'
            ? 'unsafe-id'
            : undefined,
    } as Request;
    try {
      await controller.searchProfiles(incoming, { q: 'Private Name' });
      expect(log).toHaveBeenCalledWith(expect.objectContaining({ operation: 'profile_search' }));
      expect(JSON.stringify(log.mock.calls)).not.toContain('Private Name');
      expect(JSON.stringify(log.mock.calls)).not.toContain('unsafe-id');
    } finally {
      log.mockRestore();
    }
  });

  it('accepts web cookies directly and requires CSRF for profile writes', async () => {
    const csrf = issueCsrfToken('session-id', 'a'.repeat(32));
    const cookie = `__Host-bk_access=student; __Host-bk_csrf=${csrf}`;
    expect(await controller.getMy(request('GET', undefined, cookie))).toEqual(privateProfile);
    await expect(
      controller.updateMy(request('PATCH', undefined, cookie), { bio: 'Hello' }),
    ).rejects.toThrow('Invalid CSRF token');
    expect(
      await controller.updateMy(request('PATCH', undefined, cookie, csrf), { bio: 'Hello' }),
    ).toEqual(privateProfile);
    expect(useCases.updateMy).toHaveBeenCalledWith('user-id', { bio: 'Hello' });
    await expect(controller.getMy(request('GET', 'Bearer invalid', cookie))).rejects.toThrow(
      'invalid_token',
    );
  });

  it('rejects a revoked session for every private Profile operation', async () => {
    jest.mocked(sessions.isActive).mockResolvedValue(false);
    await expect(controller.getMy(request('GET', 'Bearer student'))).rejects.toThrow(
      'invalid_token',
    );
    await expect(controller.updateMy(request('PATCH', 'Bearer student'), {})).rejects.toThrow(
      'invalid_token',
    );
    await expect(
      controller.updateUser(request('PATCH', 'Bearer admin'), 'target-id', {}),
    ).rejects.toThrow('invalid_token');
    await expect(
      controller.createAvatarUploadIntent(request('POST', 'Bearer student'), {
        contentType: 'image/png',
        size: 1,
      }),
    ).rejects.toThrow('invalid_token');
    expect(useCases.getMy).not.toHaveBeenCalled();
    expect(useCases.updateMy).not.toHaveBeenCalled();
    expect(useCases.adminUpdate).not.toHaveBeenCalled();
    expect(useCases.createAvatarUploadIntent).not.toHaveBeenCalled();
    jest.mocked(sessions.isActive).mockResolvedValue(true);
  });

  it('uses the public projection by default and the Admin projection only for verified ADMIN', async () => {
    expect(await controller.getUser(request('GET'), 'target-id')).toEqual(publicProfile);
    expect(await controller.getUser(request('GET', 'Bearer student'), 'target-id')).toEqual(
      publicProfile,
    );
    expect(await controller.getUser(request('GET', 'Bearer admin'), 'target-id')).toEqual(
      privateProfile,
    );
    expect(
      await controller.getUser(request('GET', undefined, '__Host-bk_access=admin'), 'target-id'),
    ).toEqual(privateProfile);
    expect(
      await controller.getUser(request('GET', undefined, '__Host-bk_access=invalid'), 'target-id'),
    ).toEqual(publicProfile);
    expect(useCases.adminGet).toHaveBeenCalledTimes(2);
  });

  it('rejects unknown and protected fields at the HTTP DTO boundary', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    const metadata = { type: 'body' as const, metatype: UpdateProfileDto };
    await expect(pipe.transform({ email: 'other@example.edu' }, metadata)).rejects.toThrow();
    await expect(pipe.transform({ displayName: null }, metadata)).rejects.toThrow();
    await expect(pipe.transform({ bio: null, avatar: null }, metadata)).resolves.toMatchObject({
      bio: null,
      avatar: null,
    });
    for (const patch of [{ displayName: 'Tên' }, { bio: '' }, { avatar: null }]) {
      await expect(pipe.transform(patch, metadata)).resolves.toMatchObject(patch);
    }
  });

  it('does not log or return a token supplied as a request ID', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const json = jest.fn();
    const response = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnValue({ json }),
    } as unknown as Response;
    const request = {
      method: 'PATCH',
      headers: { 'x-request-id': 'sensitive-token' },
      header: () => 'sensitive-token',
    } as unknown as Request;
    const host = {
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    } as unknown as ArgumentsHost;
    try {
      new ProfileFailureFilter().catch(new ProfileFailure('invalid'), host);
      expect(JSON.stringify(warn.mock.calls)).not.toContain('sensitive-token');
      expect(JSON.stringify(json.mock.calls)).not.toContain('sensitive-token');
    } finally {
      warn.mockRestore();
    }
  });
});
