import { z } from 'zod';

export type ServiceName =
  | 'api-gateway'
  | 'identity-service'
  | 'learning-service'
  | 'submission-service'
  | 'judge-service'
  | 'community-service';

const commonSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'log', 'debug', 'verbose']).default('log'),
});

const port = z.coerce.number().int().min(1).max(65535);
const secret = z.string().min(32);
const url = z.url();
const origins = z.string().refine(
  (value) =>
    value.split(',').every((origin) => {
      try {
        const parsed = new URL(origin.trim());
        return (
          ['http:', 'https:'].includes(parsed.protocol) &&
          parsed.origin === origin.trim() &&
          !parsed.username &&
          !parsed.password
        );
      } catch {
        return false;
      }
    }),
  'CORS_ORIGINS must be an explicit comma-separated list of HTTP(S) origins',
);

const serviceSchemas: Record<ServiceName, z.ZodObject> = {
  'api-gateway': commonSchema.extend({
    API_GATEWAY_PORT: port.default(3000),
    JWT_ACCESS_SECRET: secret,
    IDENTITY_SERVICE_URL: url,
    LEARNING_SERVICE_URL: url,
    SUBMISSION_SERVICE_URL: url,
    COMMUNITY_SERVICE_URL: url,
    REDIS_URL: url,
    CORS_ORIGINS: origins.default('http://localhost:3001'),
    AUTH_MOBILE_LOGIN_REDIRECT_URL: url.optional(),
    AUTH_RATE_LIMIT_TTL_MS: z.coerce.number().int().positive().default(60000),
    AUTH_PASSWORD_LOGIN_RATE_LIMIT: z.coerce.number().int().positive().default(5),
    AUTH_OAUTH_RATE_LIMIT: z.coerce.number().int().positive().default(30),
  }),
  'identity-service': commonSchema.extend({
    IDENTITY_SERVICE_PORT: port.default(3001),
    INTERNAL_SERVICE_SECRET: secret.optional(),
    IDENTITY_DATABASE_URL: url,
    ACCOUNT_IMPORT_PASSWORD: z.string().min(1),
    JWT_ACCESS_SECRET: secret,
    JWT_REFRESH_SECRET: secret,
    JWT_ACCESS_TTL: z.literal('15m').default('15m'),
    JWT_REFRESH_TTL: z.literal('7d').default('7d'),
    REDIS_URL: url.optional(),
    AUTH_FLOW_STORE: z.enum(['redis', 'memory']).default('redis'),
    MICROSOFT_TENANT_ID: z.uuid(),
    MICROSOFT_CLIENT_ID: z.uuid(),
    MICROSOFT_CLIENT_SECRET: z.string().min(1),
    BREVO_API_KEY: z.string().min(1).optional(),
    BREVO_SENDER_EMAIL: z.email().optional(),
    BREVO_SENDER_NAME: z.string().trim().min(1).max(100).default('BKPractice'),
    MICROSOFT_REDIRECT_URI: url,
    AUTH_WEB_LOGIN_REDIRECT_URL: url,
    AUTH_MOBILE_LOGIN_REDIRECT_URL: url.optional(),
    CORS_ORIGINS: origins.default('http://localhost:3001'),
    R2_ACCOUNT_ID: z.string().regex(/^[0-9a-f]{32}$/),
    R2_ACCESS_KEY_ID: z.string().min(1),
    R2_SECRET_ACCESS_KEY: z.string().min(1),
    R2_REFERENCE_SIGNING_KEY: z.string().min(32),
    R2_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),
    R2_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(3600),
    R2_MAX_UPLOAD_BYTES: z.coerce.number().int().positive().max(52428800),
    R2_ALLOWED_CONTENT_TYPES: z
      .string()
      .refine((value) =>
        value
          .split(',')
          .every((item) => ['image/png', 'image/jpeg', 'image/webp'].includes(item.trim())),
      ),
    R2_CLEANUP_GRACE_SECONDS: z.coerce.number().int().positive(),
  }),
  'learning-service': commonSchema.extend({
    LEARNING_SERVICE_PORT: port.default(3002),
    IDENTITY_SERVICE_URL: url.optional(),
    LEARNING_DATABASE_URL: url,
    RABBITMQ_URL: url,
    INTERNAL_SERVICE_SECRET: secret,
  }),
  'submission-service': commonSchema.extend({
    SUBMISSION_SERVICE_PORT: port.default(3003),
    SUBMISSION_DATABASE_URL: url,
    RABBITMQ_URL: url,
    REDIS_URL: url,
    LEARNING_INTERNAL_URL: url,
    INTERNAL_SERVICE_SECRET: secret,
  }),
  'judge-service': commonSchema.extend({
    JUDGE_SERVICE_PORT: port.default(3004),
    RABBITMQ_URL: url,
    JUDGE_WORKSPACE_ROOT: z.string().min(1).default('/tmp/bkpractice-judge'),
    JUDGE_MAX_OUTPUT_BYTES: z.coerce.number().int().positive().default(1048576),
    JUDGE_DOCKER_BINARY: z.string().min(1).default('docker'),
    JUDGE_DOCKER_WORKSPACE_ROOT: z.string().min(1).optional(),
  }),
  'community-service': commonSchema.extend({
    COMMUNITY_SERVICE_PORT: port.default(3005),
    COMMUNITY_DATABASE_URL: url,
  }),
};

export function validateEnvironment(service: ServiceName) {
  return (environment: Record<string, unknown>): Record<string, unknown> => {
    const result = serviceSchemas[service].safeParse(environment);
    if (!result.success) {
      const issues = result.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      throw new Error(`Invalid environment for ${service}: ${issues}`);
    }
    if (
      (service === 'api-gateway' || service === 'identity-service') &&
      result.data.NODE_ENV === 'production' &&
      String(result.data.CORS_ORIGINS)
        .split(',')
        .some((origin) => !origin.trim().startsWith('https://'))
    ) {
      throw new Error(
        `Invalid environment for ${service}: CORS_ORIGINS must use HTTPS in production`,
      );
    }
    if (service === 'identity-service') {
      if (result.data.AUTH_FLOW_STORE === 'redis' && !result.data.REDIS_URL) {
        throw new Error(
          'Invalid environment for identity-service: REDIS_URL is required for Redis auth flow storage',
        );
      }
      if (result.data.NODE_ENV === 'production' && result.data.AUTH_FLOW_STORE === 'memory') {
        throw new Error(
          'Invalid environment for identity-service: AUTH_FLOW_STORE cannot use memory in production',
        );
      }
      if (
        result.data.NODE_ENV === 'production' &&
        (!result.data.BREVO_API_KEY || !result.data.BREVO_SENDER_EMAIL)
      ) {
        throw new Error(
          'Invalid environment for identity-service: BREVO_API_KEY and BREVO_SENDER_EMAIL are required in production',
        );
      }
      if (result.data.NODE_ENV === 'production') {
        for (const key of ['MICROSOFT_REDIRECT_URI', 'AUTH_WEB_LOGIN_REDIRECT_URL'] as const) {
          const redirect: unknown = result.data[key];
          if (redirect === undefined) continue;
          if (typeof redirect !== 'string' || !redirect.startsWith('https://')) {
            throw new Error(
              `Invalid environment for ${service}: ${key} must use HTTPS in production`,
            );
          }
        }
        const mobileRedirect = result.data.AUTH_MOBILE_LOGIN_REDIRECT_URL;
        if (typeof mobileRedirect === 'string') {
          const parsed = new URL(mobileRedirect);
          if (
            parsed.username ||
            parsed.password ||
            parsed.protocol === 'http:' ||
            ['javascript:', 'data:', 'file:', 'blob:', 'mailto:'].includes(parsed.protocol)
          ) {
            throw new Error(
              `Invalid environment for ${service}: AUTH_MOBILE_LOGIN_REDIRECT_URL must use HTTPS or an app scheme`,
            );
          }
        }
      }
    }
    return { ...environment, ...result.data };
  };
}
