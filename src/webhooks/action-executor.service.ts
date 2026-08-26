import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ToolAction } from './interfaces/agent.interface';
import { LeadStatus, Priority, NotificationType } from '@prisma/client';
import { NotificationEmitterService } from '../notifications/notification-emitter.service';
import { EventsGateway } from '../events/events/events.gateway';

@Injectable()
export class ActionExecutorService {
  private readonly logger = new Logger(ActionExecutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationEmitter: NotificationEmitterService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  /**
   * Iterates over every ToolAction from the AI's gRPC reply
   * and executes it against the database. Each action is
   * individually wrapped in try/catch so one failure doesn't
   * block the rest of the pipeline.
   */
  async executeActions(
    organizationId: string,
    conversationId: string,
    actions: ToolAction[],
  ) {
    this.logger.log(
      `Processing ${actions.length} action(s) for Conv: ${conversationId}`,
    );

    for (const action of actions) {
      try {
        await this.handleAction(organizationId, conversationId, action);
      } catch (error: any) {
        this.logger.error(
          `Failed to execute action ${action.type}: ${error.message}`,
          error.stack,
        );
        // Continue processing remaining actions — don't let one failure
        // block a NOTIFY_AGENT that needs to alert the human.
      }
    }
  }

  // ─── CENTRAL DISPATCHER ───────────────────────────────────
  private async handleAction(
    organizationId: string,
    conversationId: string,
    action: ToolAction,
  ) {
    let payload: any;
    try {
      payload = JSON.parse(action.payload);
    } catch {
      this.logger.error(
        `Malformed JSON payload for action ${action.type}: ${action.payload}`,
      );
      return;
    }

    this.logger.log(
      `⚡ Executing: ${action.type} | Conv: ${conversationId} | Keys: [${Object.keys(payload).join(', ')}]`,
    );

    switch (action.type) {
      case 'CREATE_LEAD':
        await this.handleUpsertLead(organizationId, conversationId, payload);
        break;

      case 'UPDATE_LEAD':
        await this.handleUpdateLead(organizationId, conversationId, payload);
        break;

      case 'PAUSE_CONVERSATION':
        await this.handlePauseConversation(
          organizationId,
          conversationId,
          payload,
        );
        break;

      case 'NOTIFY_AGENT':
        await this.handleNotifyAgent(organizationId, payload);
        break;

      default:
        this.logger.warn(
          `Unknown action type received: "${action.type}". Dropping silently.`,
        );
    }
  }

  // ─── UPDATE_LEAD ──────────────────────────────────────────
  // Partial update to an existing lead. Uses the conversationId
  // to resolve the linked leadId (single source of truth).
  private async handleUpdateLead(
    organizationId: string,
    conversationId: string,
    payload: any,
  ) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation?.leadId) {
      this.logger.error(
        `Cannot UPDATE_LEAD: No lead linked to Conv ${conversationId}`,
      );
      return;
    }

    const updateData = this.buildLeadUpdateData(payload);

    if (Object.keys(updateData).length === 0) {
      this.logger.warn(
        `UPDATE_LEAD for Conv ${conversationId}: Payload contained no updateable fields. Skipping.`,
      );
      return;
    }

    const updatedLead = await this.prisma.lead.update({
      where: { id: conversation.leadId },
      data: updateData,
    });

    // Broadcast so the frontend pipeline/leads table reacts instantly
    this.eventsGateway.broadcastLeadUpdate(organizationId, updatedLead);

    this.logger.log(
      `✅ Lead ${conversation.leadId} updated [${Object.keys(updateData).join(', ')}] for Conv: ${conversationId}`,
    );
  }

  // ─── PAUSE_CONVERSATION ───────────────────────────────────
  // Sets aiPaused = true on the conversation. This is the NestJS-owned
  // equivalent of what Python used to do via raw SQL. Now all DB writes
  // go through Prisma, and we broadcast the state change to the frontend.
  private async handlePauseConversation(
    organizationId: string,
    conversationId: string,
    payload: any,
  ) {
    // The payload may include a specific conversationId from Python,
    // but we always trust the conversationId passed by the processor.
    const targetConvId = payload.conversationId || conversationId;

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: targetConvId },
    });

    if (!conversation) {
      this.logger.error(
        `Cannot PAUSE_CONVERSATION: Conv ${targetConvId} not found.`,
      );
      return;
    }

    if (conversation.aiPaused) {
      this.logger.log(
        `Conv ${targetConvId} is already paused. No-op.`,
      );
      return;
    }

    const updatedConversation = await this.prisma.conversation.update({
      where: { id: targetConvId },
      data: { aiPaused: true },
    });

    // Broadcast so the chat UI immediately reflects "AI Paused"
    this.eventsGateway.broadcastConversationUpdate(
      organizationId,
      updatedConversation,
    );

    this.logger.log(
      `✅ Conv ${targetConvId} paused (aiPaused = true). Frontend notified.`,
    );
  }

  // ─── NOTIFY_AGENT ─────────────────────────────────────────
  // Sends a persistent notification + real-time Socket.IO push
  // to the assigned human agent's notification bell.
  private async handleNotifyAgent(organizationId: string, payload: any) {
    if (!payload.userId) {
      this.logger.warn(
        'NOTIFY_AGENT action received without a userId. Skipping.',
      );
      return;
    }

    await this.notificationEmitter.send({
      organizationId,
      userId: payload.userId,
      type: NotificationType.LEAD_HANDED_OFF,
      title: payload.title || 'AI Escalation',
      body: payload.body || 'A conversation has been escalated by the AI.',
      referenceId: payload.referenceId,
      referenceType: payload.referenceType || 'LEAD',
    });

    this.logger.log(
      `✅ Notification sent to agent ${payload.userId} for escalation.`,
    );
  }

  // ─── CREATE_LEAD (Upsert) ─────────────────────────────────
  // If a lead is already linked to the conversation → update it.
  // If no lead exists → create one and link it.
  private async handleUpsertLead(
    organizationId: string,
    conversationId: string,
    payload: any,
  ) {
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

    const updateData = this.buildLeadUpdateData(payload);

    // If a lead is already linked, UPDATE it
    if (conversation.leadId) {
      const updatedLead = await this.prisma.lead.update({
        where: { id: conversation.leadId },
        data: updateData,
      });

      this.eventsGateway.broadcastLeadUpdate(organizationId, updatedLead);

      this.logger.log(
        `Updated existing Lead ${conversation.leadId} for Conv: ${conversationId}`,
      );
    }
    // If no lead is linked, CREATE one and link it
    else {
      const newLead = await this.prisma.lead.create({
        data: {
          ...updateData,
          organizationId: organizationId,
          phoneNumber:
            payload.phoneNumber || conversation.externalContactId || 'Unknown',
          firstName: payload.firstName || 'Unknown',
          lastName: payload.lastName || 'Unknown',
          country: payload.country || 'Unknown',
          timezone: payload.timezone || 'UTC',
          primaryLanguage: payload.primaryLanguage || 'en',
        },
      });

      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { leadId: newLead.id },
      });

      this.eventsGateway.broadcastLeadUpdate(organizationId, newLead);

      this.logger.log(
        `Created and linked new Lead ${newLead.id} for Conv: ${conversationId}`,
      );
    }
  }

  // ─── HELPERS ──────────────────────────────────────────────

  /**
   * Safely extracts known lead fields from an untyped payload.
   * Only includes fields that are present and non-empty.
   */
  private buildLeadUpdateData(payload: any): Record<string, any> {
    const updateData: Record<string, any> = {};
    if (payload.status) updateData.status = payload.status as LeadStatus;
    if (payload.priority) updateData.priority = payload.priority as Priority;
    if (payload.firstName) updateData.firstName = payload.firstName;
    if (payload.lastName) updateData.lastName = payload.lastName;
    if (payload.email) updateData.email = payload.email;
    if (payload.phoneNumber) updateData.phoneNumber = payload.phoneNumber;
    if (payload.country) updateData.country = payload.country;
    if (payload.primaryLanguage)
      updateData.primaryLanguage = payload.primaryLanguage;
    if (payload.gender) updateData.gender = payload.gender;
    if (payload.timezone) updateData.timezone = payload.timezone;
    if (payload.currency) updateData.currency = payload.currency;
    return updateData;
  }
}
