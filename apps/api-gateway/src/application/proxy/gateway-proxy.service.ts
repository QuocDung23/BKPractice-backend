import { buildApiError, resolveRequestId, AppHttpException } from '@app/common';
import {
  AUTH_COOKIE_NAMES,
  AUTH_COOKIE_REQUEST_ROUTES,
  AUTH_COOKIE_RESPONSE_ROUTES,
} from '@gateway/application/auth/auth-constants';
import {
  createAuthResponseRejectedError,
  createUnsafeRequestPathError,
  createUpstreamNotConfiguredError,
  createUpstreamUnavailableError,
  describeUpstreamErrorStatus,
  GATEWAY_ERROR_CODES,
  isApiErrorEnvelope,
} from '@gateway/application/errors/gateway-errors';
import type { UpstreamService } from '@gateway/application/errors/gateway-errors';
import { HttpService } from '@nestjs/axios';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isAxiosError } from 'axios';
import type { AxiosRequestConfig } from 'axios';
import type { Request, Response } from 'express';
import { firstValueFrom } from 'rxjs';

import {
  communityPrefixes,
  identityPrefixes,
  learningPrefixes,
  learningRoutes,
  responseHeaders,
  submissionPrefixes,
  submissionRoutes,
} from '@/application/proxy/gateway-proxy.constants';

interface RouteTarget {
  service: UpstreamService;
  prefixes: string[];
  baseUrl: string;
  routes?: ReadonlyArray<readonly [string, RegExp]>;
}

@Injectable()
export class GatewayProxyService {
  private readonly logger = new Logger(GatewayProxyService.name);
  private readonly targets: RouteTarget[];
  private readonly mobileRedirect: URL | null;

  constructor(
    private readonly http: HttpService,
    config: ConfigService,
  ) {
    this.targets = [
      {
        service: 'Identity',
        prefixes: identityPrefixes,
        baseUrl: config.getOrThrow<string>('IDENTITY_SERVICE_URL'),
      },
      {
        service: 'Learning',
        prefixes: learningPrefixes,
        routes: learningRoutes,
        baseUrl: config.getOrThrow<string>('LEARNING_SERVICE_URL'),
      },
      {
        service: 'Submission',
        prefixes: submissionPrefixes,
        routes: submissionRoutes,
        baseUrl: config.getOrThrow<string>('SUBMISSION_SERVICE_URL'),
      },
      {
        service: 'Community',
        prefixes: communityPrefixes,
        baseUrl: config.getOrThrow<string>('COMMUNITY_SERVICE_URL'),
      },
    ];
    const mobileRedirect = config.get<string>('AUTH_MOBILE_LOGIN_REDIRECT_URL');
    this.mobileRedirect = mobileRedirect ? new URL(mobileRedirect) : null;
  }

  async forward(request: Request, response: Response): Promise<void> {
    const rawPath = request.originalUrl.split('?')[0] ?? '';
    const learning = learningPrefixes.some(
      (prefix) => request.path.startsWith(prefix) || rawPath.startsWith(prefix),
    );
    const submission = submissionPrefixes.some(
      (prefix) => request.path.startsWith(prefix) || rawPath.startsWith(prefix),
    );
    if (learning || submission) this.rejectUnsafePath(request.path, rawPath);
    const target = this.targets.find((candidate) =>
      candidate.routes
        ? candidate.routes.some(
            ([method, path]) => method === request.method && path.test(request.path),
          )
        : candidate.prefixes.some((prefix) => request.path.startsWith(prefix)),
    );
    if (!target) throw createUpstreamNotConfiguredError(request.method, request.path);

    const headers = { ...request.headers };
    for (const header of Object.keys(headers)) {
      if (header.startsWith('x-internal-')) delete headers[header];
    }
    delete headers.host;
    delete headers['content-length'];
    if (!AUTH_COOKIE_REQUEST_ROUTES.has(`${request.method} ${request.path}`)) delete headers.cookie;

    const accountImport = request.method === 'POST' && request.path === '/api/auth/accounts/import';
    const multipart =
      accountImport &&
      typeof headers['content-type'] === 'string' &&
      headers['content-type'].toLowerCase().startsWith('multipart/form-data;');

    const options: AxiosRequestConfig = {
      method: request.method,
      url: `${target.baseUrl}${request.originalUrl}`,
      headers,
      data: multipart
        ? request
        : !learning && !submission && ['GET', 'HEAD'].includes(request.method)
          ? undefined
          : (request.body as unknown),
      maxBodyLength: accountImport ? 5 * 1024 * 1024 + 64 * 1024 : undefined,
      maxRedirects: 0,
      timeout: accountImport ? 300_000 : 15_000,
      validateStatus: () => true,
    };

    try {
      const upstream = await firstValueFrom(this.http.request<unknown>(options));
      if (
        AUTH_COOKIE_RESPONSE_ROUTES.has(`${request.method} ${request.path}`) &&
        upstream.status >= 200 &&
        upstream.status < 300
      ) {
        const mobile = request.headers['x-client-type'] === 'mobile';
        if (
          !mobile &&
          upstream.data &&
          typeof upstream.data === 'object' &&
          ('accessToken' in upstream.data || 'refreshToken' in upstream.data)
        ) {
          throw createAuthResponseRejectedError('body');
        }
        const rawCookies: unknown = upstream.headers['set-cookie'];
        const cookies = typeof rawCookies === 'string' ? [rawCookies] : rawCookies;
        if (mobile ? cookies !== undefined : !this.validAuthCookies(cookies)) {
          throw createAuthResponseRejectedError('cookie');
        }
        if (!mobile) response.setHeader('set-cookie', cookies as string[]);
      }
      // FR-011: lỗi của service đúng định dạng chuẩn đầy đủ thì giữ nguyên. Mọi lỗi khác (HTML của nginx, chuỗi
      // thô, body rỗng, định dạng cũ, thiếu trường, statusCode lệch) thành 502 UPSTREAM_INVALID_RESPONSE và
      // KHÔNG chuyển tiếp bất kỳ phần nào của body gốc, vì body đó có thể chứa nội dung nội bộ.
      if (upstream.status >= 400 && !isApiErrorEnvelope(upstream.data, upstream.status)) {
        const requestId = resolveRequestId(request);
        response.setHeader('content-type', 'application/json; charset=utf-8');
        response.setHeader('x-request-id', requestId);
        // Chỉ ghi status và tên service; nội dung body gốc không được ghi log hay trả về.
        this.logger.warn({ requestId, service: target.service, upstreamStatus: upstream.status });
        response.status(HttpStatus.BAD_GATEWAY).send(
          buildApiError({
            status: HttpStatus.BAD_GATEWAY,
            code: GATEWAY_ERROR_CODES.upstreamInvalidResponse,
            message: describeUpstreamErrorStatus(target.service, upstream.status, requestId),
            requestId,
          }),
        );
        return;
      }
      responseHeaders.forEach((header) => {
        const value = upstream.headers[header] as unknown;
        if (typeof value === 'string' || typeof value === 'number') {
          response.setHeader(header, String(value));
        }
      });
      if (
        upstream.status >= 300 &&
        upstream.status < 400 &&
        (request.path === '/api/auth/microsoft' || request.path === '/api/auth/microsoft/callback')
      ) {
        const location: unknown = upstream.headers.location;
        if (typeof location !== 'string') throw createAuthResponseRejectedError('redirect');
        const redirect = new URL(location);
        if (
          !this.isAllowedOAuthRedirect(redirect) ||
          redirect.username ||
          redirect.password ||
          ['access_token', 'refresh_token', 'id_token'].some(
            (key) => redirect.searchParams.has(key) || redirect.hash.includes(key),
          )
        ) {
          throw createAuthResponseRejectedError('redirect');
        }
        response.setHeader('location', redirect.toString());
      }
      if (learning || submission)
        this.logger.log({ requestId: request.headers['x-request-id'], status: upstream.status });
      response.status(upstream.status).send(upstream.data);
    } catch (error) {
      if (error instanceof AppHttpException) throw error;
      const timedOut =
        isAxiosError(error) && (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT');
      throw createUpstreamUnavailableError(target.service, timedOut ? options.timeout : undefined);
    }
  }

  private rejectUnsafePath(path: string, rawPath: string): void {
    if (path !== rawPath) throw createUnsafeRequestPathError('mismatch');
    let decoded = path;
    for (;;) {
      if (
        [...decoded].some(
          (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
        ) ||
        decoded.includes('\\') ||
        /(?:^|\/)\.{1,2}(?:\/|$)|[?#]|%2f|%5c/i.test(decoded)
      ) {
        throw createUnsafeRequestPathError('forbidden-sequence');
      }
      let next: string;
      try {
        next = decodeURIComponent(decoded);
      } catch {
        throw createUnsafeRequestPathError('bad-encoding');
      }
      if (next === decoded) return;
      decoded = next;
    }
  }

  private isAllowedOAuthRedirect(redirect: URL): boolean {
    if (['http:', 'https:'].includes(redirect.protocol)) return true;
    if (!this.mobileRedirect) return false;
    return (
      redirect.protocol === this.mobileRedirect.protocol &&
      redirect.host === this.mobileRedirect.host &&
      redirect.pathname === this.mobileRedirect.pathname
    );
  }

  private validAuthCookies(cookies: unknown): cookies is string[] {
    if (
      !Array.isArray(cookies) ||
      cookies.length !== 3 ||
      !cookies.every((cookie) => typeof cookie === 'string')
    )
      return false;
    const expected: Map<string, { path: string; httpOnly: boolean }> = new Map([
      [AUTH_COOKIE_NAMES.access, { path: '/', httpOnly: true }],
      [AUTH_COOKIE_NAMES.refresh, { path: '/api/auth', httpOnly: true }],
      [AUTH_COOKIE_NAMES.csrf, { path: '/', httpOnly: false }],
    ]);
    for (const cookie of cookies) {
      const name = cookie.slice(0, cookie.indexOf('='));
      const rules = expected.get(name);
      if (
        !rules ||
        !cookie.startsWith(`${name}=`) ||
        !cookie.includes(`; Path=${rules.path};`) ||
        !/; Secure(?:;|$)/i.test(cookie) ||
        !/; SameSite=Lax(?:;|$)/i.test(cookie) ||
        /; Domain=/i.test(cookie) ||
        rules.httpOnly !== /; HttpOnly(?:;|$)/i.test(cookie)
      )
        return false;
      expected.delete(name);
    }
    return expected.size === 0;
  }
}
