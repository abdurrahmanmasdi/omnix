import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        connection: {
          url: configService.get<string>('REDIS_URL'),
        },
      }),
      inject: [ConfigService],
    }),
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  // Apply the TenantMiddleware globally
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
