import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Turn on global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Automatically strip out any extra data sent by the client that isn't in the DTO
      forbidNonWhitelisted: true, // Throw an error if the client sends extra, unexpected data
      transform: true, // Automatically transform payloads to be objects typed according to their DTO classes
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
