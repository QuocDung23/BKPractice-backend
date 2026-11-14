import { HealthModule, RequestIdMiddleware } from '@app/common';
import { validateEnvironment } from '@app/config';
import { GatewaySessionService } from '@gateway/application/auth/gateway-session.service';
import { GatewayProxyService } from '@gateway/application/proxy/gateway-proxy.service';
import { SubmissionResultsService } from '@gateway/application/realtime/submission-results.service';
import { IdentitySessionClient } from '@gateway/infrastructure/identity/identity-session.client';
import { GatewayProxyController } from '@gateway/presentation/controllers/gateway-proxy.controller';
import { GatewayThrottlerGuard } from '@gateway/presentation/guards/gateway-throttler.guard';
import { createGatewayThrottlers } from '@gateway/presentation/guards/gateway-throttling';
import { GatewayAuthMiddleware } from '@gateway/presentation/middleware/gateway-auth.middleware';
import { SubmissionRealtimeGateway } from '@gateway/presentation/realtime/submission-realtime.gateway';
import { HttpModule } from '@nestjs/axios';
import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';

import { SubmissionResultSubscriber, SubmissionSocketLeases } from '@/infrastructure/redis';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment('api-gateway') }),
    HttpModule.register({}),
    JwtModule.register({ global: true }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: createGatewayThrottlers,
    }),
    HealthModule.forService('api-gateway'),
  ],
  controllers: [GatewayProxyController],
  providers: [
    GatewayProxyService,
    GatewaySessionService,
    SubmissionResultsService,
    IdentitySessionClient,
    SubmissionResultSubscriber,
    SubmissionSocketLeases,
    GatewayAuthMiddleware,
    SubmissionRealtimeGateway,
    { provide: APP_GUARD, useClass: GatewayThrottlerGuard },
  ],
})
export class ApiGatewayModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware, GatewayAuthMiddleware)
      .exclude(
        { path: 'health', method: RequestMethod.ALL },
        { path: 'docs/{*path}', method: RequestMethod.ALL },
      )
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
