import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DeliveryAuthService {
  private readonly logger = new Logger(DeliveryAuthService.name);

  constructor(private readonly prisma: PrismaService) {}

  async authorizeDelivery(
    organizationId: string,
    conversationId: string,
    batchVersionId?: number,
  ): Promise<boolean> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { lead: true },
    });

    if (!conversation) {
      this.logger.warn(
        `Delivery blocked: Conversation ${conversationId} not found`,
      );
      return false;
    }

    if (conversation.organizationId !== organizationId) {
      this.logger.warn(
        `Delivery blocked: Conversation ${conversationId} belongs to different org`,
      );
      return false;
    }

    if (conversation.aiPaused) {
      this.logger.warn(
        `Delivery blocked: Conversation ${conversationId} is paused`,
      );
      return false;
    }

    if (conversation.lead?.optedOutAt) {
      this.logger.warn(
        `Delivery blocked: Lead ${conversation.lead.id} opted out`,
      );
      return false;
    }

    if (
      batchVersionId !== undefined &&
      conversation.stateVersion !== batchVersionId
    ) {
      this.logger.warn(
        `Delivery blocked: Conversation ${conversationId} state version changed from ${batchVersionId} to ${conversation.stateVersion}`,
      );
      return false;
    }

    return true;
  }
}
