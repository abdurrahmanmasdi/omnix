import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ToolAction } from './interfaces/agent.interface';
import { LeadStatus, Priority } from '@prisma/client';

@Injectable()
export class ActionExecutorService {
  private readonly logger = new Logger(ActionExecutorService.name);

  constructor(private readonly prisma: PrismaService) {}

  async executeActions(
    organizationId: string,
    conversationId: string,
    actions: ToolAction[],
  ) {
    for (const action of actions) {
      try {
        await this.handleAction(organizationId, conversationId, action);
      } catch (error: any) {
        this.logger.error(
          `Failed to execute action ${action.type}: ${error.message}`,
        );
      }
    }
  }

  private async handleAction(
    organizationId: string,
    conversationId: string,
    action: ToolAction,
  ) {
    const payload = JSON.parse(action.payload);
    this.logger.log(
      `Executing Virtual Tool Action: ${action.type} for Conv: ${conversationId}`,
    );

    switch (action.type) {
      case 'CREATE_LEAD':
        await this.handleUpsertLead(organizationId, conversationId, payload);
        break;

      // We can add more cases here as the "Brain" grows
      default:
        this.logger.warn(`Unknown action type received: ${action.type}`);
    }
  }

  private async handleUpsertLead(
    organizationId: string,
    conversationId: string,
    payload: any,
  ) {
    // 1. Find the conversation and its existing lead link
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { lead: true },
    });

    if (!conversation) {
      this.logger.error(
        `Conversation ${conversationId} not found. Cannot upsert lead.`,
      );
      return;
    }

    const updateData: any = {};
    if (payload.status) updateData.status = payload.status as LeadStatus;
    if (payload.priority) updateData.priority = payload.priority as Priority;
    if (payload.firstName) updateData.firstName = payload.firstName;
    if (payload.lastName) updateData.lastName = payload.lastName;
    if (payload.email) updateData.email = payload.email;
    if (payload.phoneNumber) updateData.phoneNumber = payload.phoneNumber;
    if (payload.country) updateData.country = payload.country;

    // 2. If a lead is already linked, UPDATE it
    if (conversation.leadId) {
      await this.prisma.lead.update({
        where: { id: conversation.leadId },
        data: updateData,
      });
      this.logger.log(
        `Updated existing Lead ${conversation.leadId} for Conv: ${conversationId}`,
      );
    }
    // 3. If no lead is linked, CREATE one and link it
    else {
      const newLead = await this.prisma.lead.create({
        data: {
          ...updateData,
          organizationId: organizationId,
          // Use conversation's externalContactId if phone is missing in payload
          phoneNumber:
            payload.phoneNumber || conversation.externalContactId || 'Unknown',
          firstName: payload.firstName || 'Unknown',
        },
      });

      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { leadId: newLead.id },
      });

      this.logger.log(
        `Created and linked new Lead ${newLead.id} for Conv: ${conversationId}`,
      );
    }
  }
}
