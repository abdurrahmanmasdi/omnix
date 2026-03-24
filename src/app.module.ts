import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { validate } from './env.validation';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { GlobalExceptionFilter } from './global-exception.filter';
import { AuthModule } from './auth/auth.module';
import { GlobalAuthGuard } from './auth/guards/global-auth.guard';
import { OrganizationsModule } from './organizations/organizations.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // This makes the .env variables available everywhere
      validate, // Use our custom validation function to ensure the .env file is correct
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
      },
    }),
    // Rate Limiting: Allow max 10 requests every 60 seconds per IP
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10,
      },
    ]),
    PrismaModule,
    AuthModule,
    OrganizationsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: GlobalAuthGuard, // JWT guard for all routes except @Public()
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard, // Applies rate limiting to all routes automatically
    },
    {
      provide: APP_FILTER, // <-- Register the filter globally
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
