import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { I18nModule, AcceptLanguageResolver } from 'nestjs-i18n';
import { mkdirSync } from 'fs';
import * as path from 'path';
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
import { UsersModule } from './users/users.module';
import { SeederModule } from './seeders/seeder.module';
import { AccessControlModule } from './access-control/access-control.module';
import { ChatModule } from './chat/chat.module';
import { LeadsModule } from './leads/leads.module';
import { PipelineStagesModule } from './pipeline-stages/pipeline-stages.module';
import { LeadSourcesModule } from './lead-sources/lead-sources.module';
import { LeadNotesModule } from './lead-notes/lead-notes.module';
import { LeadAttachmentsModule } from './lead-attachments/lead-attachments.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { BankAccountsModule } from './bank-accounts/bank-accounts.module';
import { SocialLinksModule } from './social-links/social-links.module';

const logsDir = path.join(process.cwd(), 'logs');
mkdirSync(logsDir, { recursive: true });

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // This makes the .env variables available everywhere
      validate, // Use our custom validation function to ensure the .env file is correct
    }),
    EventEmitterModule.forRoot(),
    LoggerModule.forRoot({
      pinoHttp: {
        transport: {
          targets: [
            ...(process.env.NODE_ENV !== 'production'
              ? [
                  {
                    target: 'pino-pretty',
                    options: {
                      singleLine: true,
                      colorize: true,
                      translateTime: 'SYS:standard',
                    },
                  },
                ]
              : []),
            {
              target: 'pino/file',
              options: {
                destination: path.join(logsDir, 'app.log'),
                mkdir: true,
              },
            },
          ],
        },
      },
    }),
    // Internationalization (i18n)
    I18nModule.forRoot({
      fallbackLanguage: 'en',
      loaderOptions: {
        path: path.join(
          process.cwd(),
          process.env.NODE_ENV === 'production' ? 'dist/i18n/' : 'src/i18n/',
        ),
        watch: true,
      },
      resolvers: [AcceptLanguageResolver],
    }),
    // Rate Limiting: Allow max 10 requests every 60 seconds per IP
    // Disabled during testing to avoid rate limit failures in test suite
    ...(process.env.NODE_ENV === 'test'
      ? []
      : [
          ThrottlerModule.forRoot([
            {
              ttl: 60000,
              limit: 10,
            },
          ]),
        ]),
    PrismaModule,
    RedisModule,
    AuthModule,
    OrganizationsModule,
    UsersModule,
    SeederModule,
    AccessControlModule,
    ChatModule,
    LeadsModule,
    PipelineStagesModule,
    LeadSourcesModule,
    LeadNotesModule,
    LeadAttachmentsModule,
    AnalyticsModule,
    BankAccountsModule,
    SocialLinksModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantInterceptor, // Extracts and verifies tenant from x-organization-id header
    },
    {
      provide: APP_GUARD,
      useClass: GlobalAuthGuard, // JWT guard for all routes except @Public()
    },
    // Throttler guard is disabled during testing
    ...(process.env.NODE_ENV === 'test'
      ? []
      : [
          {
            provide: APP_GUARD,
            useClass: ThrottlerGuard, // Applies rate limiting to all routes automatically
          },
        ]),
    {
      provide: APP_FILTER, // <-- Register the filter globally
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
