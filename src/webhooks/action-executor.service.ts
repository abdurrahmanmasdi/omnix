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
      } catch (error) {
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
      case 'UPDATE_LEAD':
        await this.handleUpdateLead(conversationId, payload);
        break;

      // We can add more cases here as the "Brain" grows (e.g., CREATE_APPOINTMENT)
      default:
        this.logger.warn(`Unknown action type received: ${action.type}`);
    }
  }

  private async handleUpdateLead(conversationId: string, payload: any) {
    // Find the lead associated with this conversation
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { leadId: true },
    });

    if (!conversation?.leadId) {
      this.logger.error(`No lead found for conversation ${conversationId}`);
      return;
    }

    const updateData: any = {};

    if (payload.status) updateData.status = payload.status as LeadStatus;
    if (payload.priority) updateData.priority = payload.priority as Priority;
    if (payload.firstName) updateData.firstName = payload.firstName;
    if (payload.lastName) updateData.lastName = payload.lastName;
    if (payload.email) updateData.email = payload.email;

    await this.prisma.lead.update({
      where: { id: conversation.leadId },
      data: updateData,
    });

    this.logger.log(
      `Updated Lead ${conversation.leadId} with: ${JSON.stringify(updateData)}`,
    );
  }
}
