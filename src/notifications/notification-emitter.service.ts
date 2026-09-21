import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events/events.gateway';
import { NotificationType } from '@prisma/client';

export interface SendNotificationDto {
  organizationId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  referenceId?: string;
  referenceType?: string;
}

@Injectable()
export class NotificationEmitterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsGateway: EventsGateway, // Your existing WebSocket gateway
  ) {}

  /**
   * Internal method called by your background workers or AI Webhooks
   */
  async send(data: SendNotificationDto) {
    // 1. Save to Database (Persistence)
    const notification = await this.prisma.notification.create({
      data: {
        organizationId: data.organizationId,
        userId: data.userId,
        type: data.type,
        title: data.title,
        body: data.body,
        referenceId: data.referenceId,
        referenceType: data.referenceType,
      },
    });

    // 2. Emit via WebSocket in Real-Time
    // The eventsGateway will map it to a strict DTO and emit to the user's room
    this.eventsGateway.broadcastNotification(data.userId, notification);

    return notification;
  }
}
