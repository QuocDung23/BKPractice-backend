import { Logger } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { AllExceptionsFilter } from './http/errors/all-exceptions.filter';
import { ApiErrorResponseDto } from './http/errors/api-error.dto';
import { applyApiErrorSchema } from './http/errors/swagger-errors';
import { createValidationPipe } from './http/errors/validation-errors';

interface BootstrapOptions {
  serviceName: string;
  port: number;
  swaggerTitle: string;
  globalPrefix?: string;
  host?: string;
}

export async function configureHttpApp(
  app: INestApplication,
  options: BootstrapOptions,
): Promise<void> {
  app.use(helmet());
  app.enableShutdownHooks();
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());

  if (options.globalPrefix) {
    app.setGlobalPrefix(options.globalPrefix);
  }

  const swaggerConfig = new DocumentBuilder()
    .setTitle(options.swaggerTitle)
    .setDescription(`${options.serviceName} API`)
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = applyApiErrorSchema(
    SwaggerModule.createDocument(app, swaggerConfig, { extraModels: [ApiErrorResponseDto] }),
  );
  SwaggerModule.setup('docs', app, document);

  await app.listen(options.port, options.host ?? '0.0.0.0');
  Logger.log(`Listening on http://localhost:${options.port}`, options.serviceName);
  Logger.log(`Swagger UI at http://localhost:${options.port}/docs`, options.serviceName);
}
