import type { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { of } from 'rxjs';

import { GatewayProxyService } from '@/application/proxy/gateway-proxy.service';

const credential = 'test-community-secret-32-characters';
const internalCredential = 'test-internal-secret-32-characters';

describe('Community Gateway credential', () => {
  it.each([
    ['/api/community/posts', 'http://community/api/community/posts', true],
    ['/api/profiles/search', 'http://identity/api/profiles/search', false],
    ['/api/leaderboard', 'http://learning/api/leaderboard', false],
  ])('replaces client internal headers only for %s', async (path, url, community) => {
    const http = { request: jest.fn().mockReturnValue(of({ status: 200, headers: {}, data: [] })) };
    const config = new ConfigService({
      IDENTITY_SERVICE_URL: 'http://identity',
      LEARNING_SERVICE_URL: 'http://learning',
      SUBMISSION_SERVICE_URL: 'http://submission',
      COMMUNITY_SERVICE_URL: 'http://community',
      COMMUNITY_GATEWAY_SECRET: credential,
      INTERNAL_SERVICE_SECRET: internalCredential,
    });
    const response = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    } as unknown as Response;
    await new GatewayProxyService(http as unknown as HttpService, config).forward(
      {
        method: 'GET',
        path,
        originalUrl: path,
        headers: {
          'x-auth-user-id': 'verified',
          'x-internal-community-secret': 'forged',
          'x-internal-other': 'forged',
          'x-internal-service-secret': 'forged',
        },
      } as unknown as Request,
      response,
    );
    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url,
        headers: community
          ? { 'x-auth-user-id': 'verified', 'x-internal-community-secret': credential }
          : path === '/api/leaderboard'
            ? { 'x-auth-user-id': 'verified', 'x-internal-service-secret': internalCredential }
            : { 'x-auth-user-id': 'verified' },
      }),
    );
    expect(response.send).toHaveBeenCalledWith([]);
  });
});
