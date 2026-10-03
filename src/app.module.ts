import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { GrpcClientModule } from './grpc-client/grpc-client.module';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WebhooksModule } from './webhooks/webhooks.module';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { TenantMiddleware } from './core/tenant/tenant.middleware';
import { OrganizationsModule } from './organizations/organizations.module';
import { EventsModule } from './events/events.module';
import { ConversationsModule } from './conversations/conversations.module';
import { DocumentsModule } from './documents/documents.module';
import { LeadSourcesModule } from './lead-sources/lead-sources.module';
import { PipelineStagesModule } from './pipeline-stages/pipeline-stages.module';
import { LeadsModule } from './leads/leads.module';
import { NotificationsModule } from './notifications/notification.module';
import { ExperiencesModule } from './experiences/experiences.module';
import { AiPersonaModule } from './settings/ai-persona/ai-persona.module';
import { ChannelsModule } from './channels/channels.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuditModule } from './audit/audit.module';
import { CredentialsModule } from './credentials/credentials.module';

import { OutboxModule } from './core/outbox/outbox.module';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from './core/logger/logger.module';
import { MetricsModule } from './core/metrics/metrics.module';
import { HealthModule } from './health/health.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { APP_GUARD } from '@nestjs/core';
import { CsrfGuard } from './core/guards/csrf.guard';
import { validateEnv } from './config/env.validation';
import { hashedIp, THROTTLERS } from './core/guards/custom-throttler.guard';

@Module({
  imports: [
    GrpcClientModule,
    ConfigModule.forRoot({
      isGlobal: true,
      // Fail fast on missing/invalid configuration (KI-028).
      validate: validateEnv,
    }),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        connection: {
          url: configService.get<string>('REDIS_URL'),
        },
      }),
      inject: [ConfigService],
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: 60000,
            limit: 100,
          },
          { name: 'auth', ...THROTTLERS.auth },
          {
            name: 'loginIp',
            ...THROTTLERS.loginIp,
            getTracker: (req: Record<string, unknown>) => hashedIp(req),
          },
          { name: 'session', ...THROTTLERS.session },
        ],
        storage: new ThrottlerStorageRedisService(
          config.get<string>('REDIS_URL'),
        ),
      }),
    }),
    LoggerModule,
    MetricsModule,
    HealthModule,
    WebhooksModule,
    AuthModule,
    PrismaModule,
    OrganizationsModule,
    EventsModule,
    ConversationsModule,
    DocumentsModule,
    ExperiencesModule,
    LeadSourcesModule,
    LeadsModule,
    NotificationsModule,
    PipelineStagesModule,
    AiPersonaModule,
    ChannelsModule,
    AnalyticsModule,
    AuditModule,
    CredentialsModule,
    OutboxModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
  ],
})
export class AppModule implements NestModule {
  // Apply the TenantMiddleware globally
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
