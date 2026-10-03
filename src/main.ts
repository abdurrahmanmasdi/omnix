import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { parseFrontendOrigins } from './config/frontend-origins';
import cookieParser from 'cookie-parser';
import { Logger } from 'nestjs-pino';
import type { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  // Preserve the exact bytes Meta signed. JSON parsing changes whitespace/key
  // ordering, so verification must never be performed against @Body().
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bufferLogs: true,
  });

  // Trust proxy so rate limiting IP is correct (e.g. via nginx)
  app.set('trust proxy', 1);

  // Limit JSON and urlencoded payloads to 2MB (prevents DoS on webhook endpoints)
  app.useBodyParser('json', { limit: '2mb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '2mb' });

  // Use Pino as the default logger
  app.enableShutdownHooks();
  app.useLogger(app.get(Logger));

  // Enable cookie parser
  app.use(cookieParser());

  const frontendUrls = parseFrontendOrigins();

  app.enableCors({
    origin: frontendUrls,
    credentials: true, // Required to allow cookies to pass through
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strips out any properties not defined in the DTO
      forbidNonWhitelisted: true, // Throws an error if extra properties are sent
      transform: true, // Automatically transforms payloads to be objects typed according to their DTO classes
    }),
  );

  // --- Swagger Configuration ---
  const config = new DocumentBuilder()
    .setTitle('Lean Commerce API')
    .setDescription('The AI Sales Agent CRM API Documentation')
    .setVersion('1.0')
    .addBearerAuth() // This adds a "Authorize" button to the UI later!
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document); // Hosts the docs at http://localhost:3000/api

  await app.listen(
    app.get(ConfigService).get<number>('PORT') ?? 3001,
    '0.0.0.0',
  );
}
void bootstrap();
