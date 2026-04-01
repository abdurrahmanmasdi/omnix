import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger, LoggerErrorInterceptor } from 'nestjs-pino';
import { I18nValidationPipe } from 'nestjs-i18n';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './redis/redis-io.adapter';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.useGlobalInterceptors(new LoggerErrorInterceptor());

  // WebSocket Adapter - Redis for Pub/Sub (Scalability)
  const redisIoAdapter = new RedisIoAdapter(app);
  try {
    await redisIoAdapter.connectToRedis();
    app.useWebSocketAdapter(redisIoAdapter);
  } catch (error) {
    console.error(
      'Failed to setup Redis WebSocket adapter. WebSockets may not work correctly.',
      error,
    );
    // Continue without Redis adapter - WebSockets will still work, just not distributed
  }

  // 1. Security Headers
  app.use(helmet());

  // 2. CORS (Cross-Origin Resource Sharing)
  // Only allows your specific Next.js frontend to talk to this API
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    credentials: true,
  });

  app.use(cookieParser());

  // 3. Global API Prefix
  // Prefixes all routes with /api
  app.setGlobalPrefix('api');

  // 4. API Versioning
  // Combined with global prefix, routes become /api/v1/*
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // 5. Global Validation with i18n Support
  app.useGlobalPipes(
    new I18nValidationPipe({
      whitelist: true, // Automatically strip out any extra data sent by the client that isn't in the DTO
      forbidNonWhitelisted: true, // Throw an error if the client sends extra, unexpected data
      transform: true, // Automatically transform payloads to be objects typed according to their DTO classes
    }),
  );

  // 6. Environment-Specific Swagger
  // Only builds and serves the /docs route if we are NOT in production
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('SaaS API')
      .setDescription('The core API for my multi-tenant SaaS')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
