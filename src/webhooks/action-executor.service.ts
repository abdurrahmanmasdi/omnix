import { Injectable, Logger } from '@nestjs/common';
import { Conversation, Lead } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ToolAction } from './interfaces/agent.interface';
import { LeadStatus, Priority, NotificationType } from '@prisma/client';
import { NotificationEmitterService } from '../notifications/notification-emitter.service';
import { EventsGateway } from '../events/events/events.gateway';
import { CrmIntegrationService } from '../modules/integration/crm/crm-integration.service';
import { FollowUpService } from '../follow-ups/follow-up.service';
import { AuditService } from '../audit/audit.service';

/** Statuses that trigger an automatic CRM sync */
const CRM_SYNC_STATUSES: LeadStatus[] = [
  LeadStatus.QUALIFIED,
  LeadStatus.READY_TO_BOOK,
];

const VALID_STATUS_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  [LeadStatus.NEW]: [
    LeadStatus.QUALIFYING,
    LeadStatus.QUALIFIED,
    LeadStatus.UNQUALIFIED,
    LeadStatus.HANDED_OFF,
  ],
  [LeadStatus.QUALIFYING]: [
    LeadStatus.QUALIFIED,
    LeadStatus.UNQUALIFIED,
    LeadStatus.HANDED_OFF,
    LeadStatus.READY_TO_BOOK,
    LeadStatus.READY_TO_PAY,
  ],
  [LeadStatus.QUALIFIED]: [
    LeadStatus.READY_TO_BOOK,
    LeadStatus.READY_TO_PAY,
    LeadStatus.UNQUALIFIED,
    LeadStatus.HANDED_OFF,
    LeadStatus.WON,
  ],
  [LeadStatus.READY_TO_BOOK]: [
    LeadStatus.READY_TO_PAY,
    LeadStatus.WON,
    LeadStatus.UNQUALIFIED,
    LeadStatus.HANDED_OFF,
  ],
  [LeadStatus.READY_TO_PAY]: [
    LeadStatus.WON,
    LeadStatus.LOST,
    LeadStatus.UNQUALIFIED,
    LeadStatus.HANDED_OFF,
  ],
  [LeadStatus.WON]: [LeadStatus.HANDED_OFF],
  [LeadStatus.LOST]: [LeadStatus.HANDED_OFF],
  [LeadStatus.UNQUALIFIED]: [LeadStatus.HANDED_OFF],
  [LeadStatus.HANDED_OFF]: [
    LeadStatus.QUALIFYING,
    LeadStatus.QUALIFIED,
    LeadStatus.UNQUALIFIED,
    LeadStatus.NEW,
    LeadStatus.READY_TO_BOOK,
    LeadStatus.READY_TO_PAY,
    LeadStatus.WON,
    LeadStatus.LOST,
  ],
};

@Injectable()
export class ActionExecutorService {
  private readonly logger = new Logger(ActionExecutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationEmitter: NotificationEmitterService,
    private readonly eventsGateway: EventsGateway,
    private readonly crmIntegration: CrmIntegrationService,
    private readonly followUpService: FollowUpService,
    private readonly auditService: AuditService,
  ) {}

  async executeActions(
    organizationId: string,
    conversationId: string,
    actions: ToolAction[],
  ): Promise<{ executed: number; rejected: number; failed: number }> {
    const result = { executed: 0, rejected: 0, failed: 0 };
    if (!actions || actions.length === 0) return result;

    this.logger.log(
      `Processing ${actions.length} action(s) for Conv: ${conversationId} in Org: ${organizationId}`,
    );

    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, organizationId },
      include: { lead: true },
    });

    if (!conversation) {
      this.logger.error(
        `executeActions aborted: conversation ${conversationId} not found in org ${organizationId}`,
      );
      result.failed = actions.length;
      return result;
    }

    for (const action of actions) {
      try {
        const outcome = await this.handleAction(conversation, action);
        if (outcome === 'executed') result.executed++;
        else if (outcome === 'rejected') result.rejected++;
      } catch (error: any) {
        this.logger.error(
          `Failed to execute action ${action.type}: ${error.message}`,
          error.stack,
        );
        result.failed++;
      }
    }
    return result;
  }

  private async handleAction(
    conversation: Conversation & { lead?: Lead | null },
    action: ToolAction,
  ): Promise<'executed' | 'rejected'> {
    let payload: Record<string, any>;
    try {
      payload = JSON.parse(action.payload);
    } catch {
      this.logger.error(
        `Rejected malformed JSON payload for action ${action.type}`,
      );
      return 'rejected';
    }

    // Do not log the raw action payload to avoid leaking PII!
    this.logger.log(`⚡ Executing: ${action.type} | Conv: ${conversation.id}`);

    switch (action.type) {
      case 'CREATE_LEAD':
        await this.handleUpsertLead(conversation, payload);
        break;

      case 'UPDATE_LEAD':
        await this.handleUpdateLead(conversation, payload);
        break;

      case 'PAUSE_CONVERSATION':
        await this.handlePauseConversation(conversation);
        break;

      case 'NOTIFY_AGENT':
        await this.handleNotifyAgent(conversation, payload);
        break;

      case 'UPDATE_SUMMARY':
        await this.handleUpdateSummary(conversation, payload);
        break;

      case 'HANDOFF_TO_HUMAN':
        await this.handleHandoffToHuman(conversation, payload);
        break;

      case 'SCHEDULE_FOLLOW_UP':
        if (
          !payload.scheduledAt ||
          isNaN(new Date(payload.scheduledAt).getTime())
        ) {
          throw new Error('Invalid or missing scheduledAt date');
        }
        await this.followUpService.scheduleAiFollowUp(
          conversation.organizationId,
          conversation.id,
          new Date(payload.scheduledAt),
          payload.context || '',
        );
        break;

      default:
        this.logger.warn(`Rejected unknown action type: "${action.type}"`);
        return 'rejected';
    }
    return 'executed';
  }

  private async handleUpdateLead(
    conversation: Conversation & { lead?: Lead | null },
    payload: any,
  ) {
    if (!conversation.leadId) {
      throw new Error(
        `Cannot UPDATE_LEAD: No lead linked to Conv ${conversation.id}`,
      );
    }

    const updateData = this.buildLeadUpdateData(
      payload,
      conversation.lead?.status,
    );

    if (Object.keys(updateData).length === 0) {
      throw new Error(`UPDATE_LEAD payload contained no updateable fields.`);
    }

    const updatedLead = await this.prisma.lead.update({
      where: { id: conversation.leadId },
      data: updateData,
    });

    this.eventsGateway.broadcastLeadUpdate(
      conversation.organizationId,
      updatedLead,
    );
    this.logger.log(
      `✅ Lead ${conversation.leadId} updated for Conv: ${conversation.id}`,
    );

    if (
      updateData.status &&
      CRM_SYNC_STATUSES.includes(updateData.status) &&
      !updatedLead.externalContactId
    ) {
      try {
        const { externalContactId, externalDealId } =
          await this.crmIntegration.syncLeadToExternalCrm(
            updatedLead,
            updatedLead.externalCrmType,
          );

        if (externalContactId) {
          await this.prisma.lead.update({
            where: { id: updatedLead.id },
            data: { externalContactId, externalDealId },
          });
        }
      } catch (crmError: any) {
        this.logger.error(
          `CRM sync failed for Lead ${updatedLead.id}: ${crmError.message}`,
          crmError.stack,
        );
      }
    }
  }

  private async handlePauseConversation(
    conversation: Conversation & { lead?: Lead | null },
  ) {
    if (conversation.aiPaused) return;

    const updatedConversation = await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { aiPaused: true, stateVersion: { increment: 1 } },
    });

    this.eventsGateway.broadcastConversationUpdate(
      conversation.organizationId,
      updatedConversation,
    );
    this.logger.log(`✅ Conv ${conversation.id} paused.`);
  }

  private async handleNotifyAgent(
    conversation: Conversation & { lead?: Lead | null },
    payload: any,
  ) {
    const targetUserId = conversation.lead?.assignedAgentId;

    if (targetUserId) {
      await this.notificationEmitter.send({
        organizationId: conversation.organizationId,
        userId: targetUserId,
        type: NotificationType.LEAD_HANDED_OFF,
        title:
          typeof payload.title === 'string' ? payload.title : 'AI Escalation',
        body:
          typeof payload.body === 'string'
            ? payload.body
            : 'A conversation has been escalated by the AI.',
        referenceId: conversation.leadId || conversation.id,
        referenceType: conversation.leadId ? 'LEAD' : 'CONVERSATION',
      });
      this.logger.log(`✅ Notification sent to assigned agent ${targetUserId}`);
    } else {
      const memberships = await this.prisma.organizationMembership.findMany({
        where: {
          organizationId: conversation.organizationId,
          status: 'ACTIVE',
          deletedAt: null,
        },
      });
      for (const membership of memberships) {
        await this.notificationEmitter.send({
          organizationId: conversation.organizationId,
          userId: membership.userId,
          type: NotificationType.LEAD_HANDED_OFF,
          title:
            typeof payload.title === 'string' ? payload.title : 'AI Escalation',
          body:
            typeof payload.body === 'string'
              ? payload.body
              : 'A conversation has been escalated by the AI.',
          referenceId: conversation.leadId || conversation.id,
          referenceType: conversation.leadId ? 'LEAD' : 'CONVERSATION',
        });
      }
      this.logger.log(`✅ Notification sent to ${memberships.length} admin(s)`);
    }
  }

  private async handleUpsertLead(
    conversation: Conversation & { lead?: Lead | null },
    payload: any,
  ) {
    const updateData = this.buildLeadUpdateData(
      payload,
      conversation.lead?.status,
    );

    if (conversation.leadId) {
      const updatedLead = await this.prisma.lead.update({
        where: { id: conversation.leadId },
        data: updateData,
      });
      this.eventsGateway.broadcastLeadUpdate(
        conversation.organizationId,
        updatedLead,
      );
    } else {
      const newLead = await this.prisma.lead.create({
        data: {
          ...updateData,
          organizationId: conversation.organizationId,
          phoneNumber:
            typeof payload.phoneNumber === 'string'
              ? payload.phoneNumber
              : conversation.externalContactId || 'Unknown',
          firstName:
            typeof payload.firstName === 'string'
              ? payload.firstName
              : 'Unknown',
          lastName:
            typeof payload.lastName === 'string' ? payload.lastName : 'Unknown',
          country:
            typeof payload.country === 'string' ? payload.country : 'Unknown',
          timezone:
            typeof payload.timezone === 'string' ? payload.timezone : 'UTC',
          primaryLanguage:
            typeof payload.primaryLanguage === 'string'
              ? payload.primaryLanguage
              : 'en',
        },
      });
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { leadId: newLead.id },
      });
      this.eventsGateway.broadcastLeadUpdate(
        conversation.organizationId,
        newLead,
      );
    }
  }

  public async handleHandoffToHuman(
    conversation: Conversation & { lead?: Lead | null },
    payload: any,
  ) {
    const reason =
      typeof payload.reason === 'string'
        ? payload.reason
        : 'User requested human intervention';

    // Idempotency: if already paused, skip re-pausing and re-notifying, but consider it successful.
    if (conversation.aiPaused) {
      this.logger.log(
        `Handoff already processed for Conv: ${conversation.id}. Ignoring duplicate.`,
      );
      return;
    }

    const leadId = conversation.leadId;
    const organizationId = conversation.organizationId;

    const [updatedConversation, updatedLead] = await this.prisma.$transaction(
      async (tx) => {
        const conv = await tx.conversation.update({
          where: { id: conversation.id },
          data: { aiPaused: true, stateVersion: { increment: 1 } },
        });

        let lead = null;
        if (leadId) {
          lead = await tx.lead.update({
            where: { id: leadId },
            data: { status: 'HANDED_OFF' }, // LeadStatus.HANDED_OFF
          });
        }
        return [conv, lead];
      },
    );

    const memberships = await this.prisma.organizationMembership.findMany({
      where: {
        organizationId: organizationId,
        status: 'ACTIVE',
        deletedAt: null,
      },
    });

    if (memberships.length === 0) {
      // T10: If no staff member exists, create an operational alert/audit record; do not report a completed staff notification.
      this.logger.warn(`No staff found for Handoff in Org ${organizationId}`);
      await this.auditService.record({
        organizationId: organizationId,
        action: 'ai.handoff_failed_no_staff',
        targetId: conversation.id,
        actor: 'ai',
        metadata: { reason },
      });
    } else {
      // Ensure at least one eligible staff notification is persisted
      for (const membership of memberships) {
        await this.notificationEmitter.send({
          organizationId: organizationId,
          userId: membership.userId,
          type: 'LEAD_HANDED_OFF', // NotificationType.LEAD_HANDED_OFF
          title: 'Human Intervention Required',
          body: `Requires human attention: ${reason}`,
          referenceId: updatedLead ? updatedLead.id : updatedConversation.id,
          referenceType: updatedLead ? 'LEAD' : 'CONVERSATION',
        });
      }
    }

    if (updatedLead) {
      this.eventsGateway.broadcastLeadUpdate(organizationId, updatedLead);
    }
    this.eventsGateway.broadcastConversationUpdate(
      organizationId,
      updatedConversation,
    );
  }

  private async handleUpdateSummary(
    conversation: Conversation & { lead?: Lead | null },
    payload: any,
  ) {
    const summary = payload.summary;
    if (!summary || typeof summary !== 'string') {
      throw new Error(`UPDATE_SUMMARY action missing or invalid 'summary'`);
    }

    if (conversation.leadId) {
      await this.prisma.lead.update({
        where: { id: conversation.leadId },
        data: { summary },
      });
    } else {
      throw new Error(
        `Cannot update summary. No Lead linked to Conv ${conversation.id}`,
      );
    }
  }

  private buildLeadUpdateData(
    payload: any,
    currentStatus?: LeadStatus,
  ): Record<string, any> {
    const updateData: Record<string, any> = {};

    if (payload.status !== undefined) {
      if (!Object.values(LeadStatus).includes(payload.status)) {
        throw new Error(`Invalid status: ${payload.status}`);
      }
      if (currentStatus && payload.status !== currentStatus) {
        const allowedNext = VALID_STATUS_TRANSITIONS[currentStatus] || [];
        if (!allowedNext.includes(payload.status as LeadStatus)) {
          throw new Error(
            `Invalid lead status transition from ${currentStatus} to ${payload.status}`,
          );
        }
      }
      updateData.status = payload.status as LeadStatus;
    }

    if (payload.priority !== undefined) {
      if (!Object.values(Priority).includes(payload.priority)) {
        throw new Error(`Invalid priority: ${payload.priority}`);
      }
      updateData.priority = payload.priority as Priority;
    }

    // Only allow specific string fields
    const stringFields = [
      'firstName',
      'lastName',
      'email',
      'phoneNumber',
      'country',
      'primaryLanguage',
      'gender',
      'timezone',
      'currency',
    ];
    for (const field of stringFields) {
      if (payload[field] !== undefined) {
        if (typeof payload[field] !== 'string') {
          throw new Error(`Invalid type for ${field}, expected string`);
        }
        updateData[field] = payload[field];
      }
    }

    return updateData;
  }
}
