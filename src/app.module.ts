import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { validate } from './env.validation';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { GlobalExceptionFilter } from './global-exception.filter';
import { AuthModule } from './auth/auth.module';
import { GlobalAuthGuard } from './auth/guards/global-auth.guard';
import { OrganizationsModule } from './organizations/organizations.module';
import { TenantInterceptor } from './organizations/interceptors/tenant.interceptor';
import { AccessControlModule } from './access-control/access-control.module';
import { UsersModule } from './users/users.module';
import { PermissionSeederService } from './seeders/permission-seeder.service';

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
    RedisModule,
    AuthModule,
    OrganizationsModule,
    AccessControlModule,
    UsersModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    PermissionSeederService, // Auto-seeds permissions on app startup
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantInterceptor, // Extracts and verifies tenant from x-organization-id header
    },
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
