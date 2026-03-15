import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger, LoggerErrorInterceptor } from 'nestjs-pino';
import { AppModule } from './app.module';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.useGlobalInterceptors(new LoggerErrorInterceptor());

  // 1. Security Headers
  app.use(helmet());

  // 2. CORS (Cross-Origin Resource Sharing)
  // Only allows your specific Next.js frontend to talk to this API
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    credentials: true,
  });

  // 3. API Versioning
  // Automatically prefixes all your routes with /v1/ (e.g., localhost:3000/v1/auth/login)
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // 4. Global Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Automatically strip out any extra data sent by the client that isn't in the DTO
      forbidNonWhitelisted: true, // Throw an error if the client sends extra, unexpected data
      transform: true, // Automatically transform payloads to be objects typed according to their DTO classes
    }),
  );

  // 5. Environment-Specific Swagger
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
bootstrap();
