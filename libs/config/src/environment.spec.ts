import { validateEnvironment } from './environment';

const identity = {
  ACCOUNT_IMPORT_PASSWORD: 'test-import-password',
  NODE_ENV: 'test',
  IDENTITY_DATABASE_URL: 'postgresql://localhost/bkpractice_identity_test',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'r'.repeat(32),
  MICROSOFT_TENANT_ID: '11111111-1111-4111-8111-111111111111',
  MICROSOFT_CLIENT_ID: '22222222-2222-4222-8222-222222222222',
  MICROSOFT_CLIENT_SECRET: 'test-only',
  MICROSOFT_REDIRECT_URI: 'http://localhost/callback',
  AUTH_WEB_LOGIN_REDIRECT_URL: 'http://localhost/auth/callback',
  R2_ACCOUNT_ID: 'a'.repeat(32),
  R2_ACCESS_KEY_ID: 'test-key-id',
  R2_SECRET_ACCESS_KEY: 'test-secret',
  R2_REFERENCE_SIGNING_KEY: 's'.repeat(32),
  R2_BUCKET: 'test-avatars',
  R2_SIGNED_URL_TTL_SECONDS: '300',
  R2_MAX_UPLOAD_BYTES: '5242880',
  R2_ALLOWED_CONTENT_TYPES: 'image/png,image/jpeg,image/webp',
  R2_CLEANUP_GRACE_SECONDS: '3600',
};

describe('Identity configuration', () => {
  it('requires a non-empty import password without changing its value', () => {
    const missing: Record<string, string> = { ...identity };
    delete missing.ACCOUNT_IMPORT_PASSWORD;
    expect(() => validateEnvironment('identity-service')(missing)).toThrow(
      'ACCOUNT_IMPORT_PASSWORD',
    );
    expect(() =>
      validateEnvironment('identity-service')({
        ...identity,
        ACCOUNT_IMPORT_PASSWORD: '',
      }),
    ).toThrow('ACCOUNT_IMPORT_PASSWORD');
    expect(validateEnvironment('identity-service')(identity).ACCOUNT_IMPORT_PASSWORD).toBe(
      identity.ACCOUNT_IMPORT_PASSWORD,
    );
  });

  it('fails early without Microsoft configuration', () => {
    const missing: Record<string, string> = { ...identity };
    delete missing.MICROSOFT_CLIENT_ID;
    expect(() => validateEnvironment('identity-service')(missing)).toThrow();
  });

  it('requires R2 settings and only approved image types', () => {
    const missing: Record<string, string> = { ...identity };
    delete missing.R2_BUCKET;
    expect(() => validateEnvironment('identity-service')(missing)).toThrow('R2_BUCKET');
    expect(() =>
      validateEnvironment('identity-service')({
        ...identity,
        R2_ALLOWED_CONTENT_TYPES: 'image/svg+xml',
      }),
    ).toThrow('R2_ALLOWED_CONTENT_TYPES');
  });

  it('requires refresh lifetime to exceed access lifetime', () => {
    expect(() =>
      validateEnvironment('identity-service')({
        ...identity,
        JWT_ACCESS_TTL: '7d',
        JWT_REFRESH_TTL: '15m',
      }),
    ).toThrow();
  });

  it('requires HTTPS redirects in production', () => {
    expect(() =>
      validateEnvironment('identity-service')({ ...identity, NODE_ENV: 'production' }),
    ).toThrow();
  });

  it('allows a mobile app scheme for the mobile redirect in production', () => {
    const production = {
      ...identity,
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://example.test',
      MICROSOFT_REDIRECT_URI: 'https://example.test/callback',
      AUTH_WEB_LOGIN_REDIRECT_URL: 'https://example.test/auth/callback',
      BREVO_API_KEY: 'test-key',
      BREVO_SENDER_EMAIL: 'verified@example.com',
      AUTH_MOBILE_LOGIN_REDIRECT_URL: 'bkpracticemobile://auth/callback',
    };
    expect(validateEnvironment('identity-service')(production).AUTH_MOBILE_LOGIN_REDIRECT_URL).toBe(
      'bkpracticemobile://auth/callback',
    );
    expect(() =>
      validateEnvironment('identity-service')({
        ...production,
        AUTH_MOBILE_LOGIN_REDIRECT_URL: 'http://example.test/auth/callback',
      }),
    ).toThrow('AUTH_MOBILE_LOGIN_REDIRECT_URL');
  });

  it('requires Brevo credentials in production', () => {
    const production = {
      ...identity,
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://example.test',
      MICROSOFT_REDIRECT_URI: 'https://example.test/callback',
      AUTH_WEB_LOGIN_REDIRECT_URL: 'https://example.test/auth/callback',
    };
    expect(() => validateEnvironment('identity-service')(production)).toThrow('BREVO_API_KEY');
    expect(
      validateEnvironment('identity-service')({
        ...production,
        BREVO_API_KEY: 'test-key',
        BREVO_SENDER_EMAIL: 'verified@example.com',
      }).BREVO_SENDER_EMAIL,
    ).toBe('verified@example.com');
  });

  it('defaults and validates the Brevo sender display name', () => {
    expect(validateEnvironment('identity-service')(identity).BREVO_SENDER_NAME).toBe('BKPractice');
    expect(
      validateEnvironment('identity-service')({
        ...identity,
        BREVO_SENDER_NAME: 'BKPractice Support',
      }).BREVO_SENDER_NAME,
    ).toBe('BKPractice Support');
    expect(() =>
      validateEnvironment('identity-service')({
        ...identity,
        BREVO_SENDER_NAME: '   ',
      }),
    ).toThrow('BREVO_SENDER_NAME');
  });

  it('uses Redis by default and forbids memory storage in production', () => {
    expect(validateEnvironment('identity-service')(identity).AUTH_FLOW_STORE).toBe('redis');
    expect(() =>
      validateEnvironment('identity-service')({
        ...identity,
        NODE_ENV: 'production',
        AUTH_FLOW_STORE: 'memory',
        MICROSOFT_REDIRECT_URI: 'https://example.test/callback',
        AUTH_WEB_LOGIN_REDIRECT_URL: 'https://example.test/auth/callback',
        CORS_ORIGINS: 'https://example.test',
      }),
    ).toThrow('AUTH_FLOW_STORE cannot use memory in production');
  });

  it('rejects wildcard credentialed origins and non-HTTPS production origins', () => {
    expect(() =>
      validateEnvironment('identity-service')({ ...identity, CORS_ORIGINS: '*' }),
    ).toThrow('CORS_ORIGINS');
    expect(() =>
      validateEnvironment('identity-service')({
        ...identity,
        NODE_ENV: 'production',
        CORS_ORIGINS: 'http://app.example',
        MICROSOFT_REDIRECT_URI: 'https://example.test/callback',
        AUTH_WEB_LOGIN_REDIRECT_URL: 'https://example.test/auth/callback',
      }),
    ).toThrow('CORS_ORIGINS must use HTTPS');
  });

  it('does not require Redis when the local auth flow store is selected', () => {
    const withoutRedis: Record<string, string> = { ...identity, AUTH_FLOW_STORE: 'memory' };
    delete withoutRedis.REDIS_URL;
    expect(validateEnvironment('identity-service')(withoutRedis).AUTH_FLOW_STORE).toBe('memory');
    delete withoutRedis.AUTH_FLOW_STORE;
    expect(() => validateEnvironment('identity-service')(withoutRedis)).toThrow(
      'REDIS_URL is required for Redis auth flow storage',
    );
  });
});

describe('Community Gateway credential configuration', () => {
  const gateway = {
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    IDENTITY_SERVICE_URL: 'http://identity',
    LEARNING_SERVICE_URL: 'http://learning',
    SUBMISSION_SERVICE_URL: 'http://submission',
    COMMUNITY_SERVICE_URL: 'http://community',
    REDIS_URL: 'redis://localhost:6379',
  };
  it.each([
    ['api-gateway' as const, gateway],
    ['community-service' as const, { COMMUNITY_DATABASE_URL: 'postgresql://localhost/community' }],
  ])('requires a strong private credential for %s', (service, environment) => {
    expect(() => validateEnvironment(service)(environment)).toThrow('COMMUNITY_GATEWAY_SECRET');
    expect(() =>
      validateEnvironment(service)({ ...environment, COMMUNITY_GATEWAY_SECRET: 'short' }),
    ).toThrow('COMMUNITY_GATEWAY_SECRET');
    expect(
      validateEnvironment(service)({ ...environment, COMMUNITY_GATEWAY_SECRET: 'c'.repeat(32) })
        .COMMUNITY_GATEWAY_SECRET,
    ).toBe('c'.repeat(32));
  });
});
