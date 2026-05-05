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
