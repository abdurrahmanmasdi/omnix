import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { GRPC_CONFIG } from './config/grpc.constants';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable cookie parser
  app.use(cookieParser());

  app.enableCors({
    origin: 'http://localhost:3001', // Your Next.js frontend URL
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

  // This tells NestJS to listen on port 50052 for Python's Tool requests
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: GRPC_CONFIG.PACKAGES.TOOLS,
      protoPath: GRPC_CONFIG.PROTO_PATHS.TOOLS,
      url: GRPC_CONFIG.NEST_SERVER_URL,
    },
  });

  // Start the microservice listeners
  await app.startAllMicroservices();

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
