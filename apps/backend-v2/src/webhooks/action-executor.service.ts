import { Injectable, Logger } from '@nestjs/common';
import { Conversation, Lead } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ToolActionWire } from './interfaces/agent.interface';
import { parseAgentAction } from './contracts/agent-contract';
import {
  LeadStatus,
  Priority,
  NotificationType,
  Gender,
  Currency,
} from '@prisma/client';
import { NotificationEmitterService } from '../notifications/notification-emitter.service';
import { EventsGateway } from '../events/events/events.gateway';
import { CrmIntegrationService } from '../modules/integration/crm/crm-integration.service';
import { FollowUpService } from '../follow-ups/follow-up.service';
import { AuditService } from '../audit/audit.service';
import {
  MEMBERSHIP_GRANTS_INCLUDE,
  membershipHasPermission,
} from '../auth/permission.service';

/** Statuses that trigger an automatic CRM sync */
const CRM_SYNC_STATUSES: LeadStatus[] = [
  LeadStatus.QUALIFIED,
  LeadStatus.READY_TO_BOOK,
];

export interface ActionOutcome {
  index: number;
  type: string;
  status: 'EXECUTED' | 'REJECTED' | 'FAILED';
  reasonCode: string;
  retryable: boolean;
}

export interface ActionExecutionSummary {
  executed: number;
  rejected: number;
  failed: number;
  outcomes: ActionOutcome[];
}

/**
 * Statuses an AI action may set (KI-024). WON / LOST / READY_TO_PAY /
 * UNQUALIFIED / NEW are staff decisions; the contract rejects them too.
 */
const AI_SETTABLE_STATUSES: LeadStatus[] = [
  LeadStatus.QUALIFYING,
  LeadStatus.QUALIFIED,
  LeadStatus.READY_TO_BOOK,
  LeadStatus.HANDED_OFF,
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
    actions: ToolActionWire[],
  ): Promise<ActionExecutionSummary> {
    const result: ActionExecutionSummary = {
      executed: 0,
      rejected: 0,
      failed: 0,
      outcomes: [],
    };
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
      actions.forEach((action, index) =>
        result.outcomes.push({
          index,
          type: action.type,
          status: 'FAILED',
          reasonCode: 'CONVERSATION_NOT_FOUND',
          retryable: false,
        }),
      );
      return result;
    }

    for (const [index, action] of actions.entries()) {
      try {
        const outcome = await this.handleAction(conversation, action);
        if (outcome === 'executed') {
          result.executed++;
          result.outcomes.push({
            index,
            type: action.type,
            status: 'EXECUTED',
            reasonCode: 'OK',
            retryable: false,
          });
        } else {
          result.rejected++;
          result.outcomes.push({
            index,
            type: action.type,
            status: 'REJECTED',
            reasonCode: 'ACTION_INVALID',
            retryable: false,
          });
        }
      } catch (error: any) {
        this.logger.error(
          `ACTION_EXECUTION_FAILED conversationId=${conversationId}`,
        );
        result.failed++;
        const code = error instanceof Error ? error.message : '';
        const permanent =
          /^(HANDOFF_LEAD_TENANT_MISMATCH|INVALID_|Invalid |Cannot |UPDATE_|NO_UPDATEABLE_FIELDS)/.test(
            code,
          );
        result.outcomes.push({
          index,
          type: action.type,
          status: 'FAILED',
          reasonCode:
            code === 'NO_ELIGIBLE_STAFF'
              ? code
              : permanent
                ? 'ACTION_VALIDATION_FAILED'
                : 'ACTION_WRITE_FAILED',
          retryable: !permanent,
        });
        if (code === 'NO_ELIGIBLE_STAFF') {
          try {
            await this.auditService.record({
              organizationId,
              action: 'ai.handoff_failed_no_staff',
              targetId: conversationId,
              actor: 'ai',
              metadata: { reason: 'NO_ELIGIBLE_STAFF' },
            });
          } catch {
            this.logger.warn(
              `HANDOFF_FAILURE_AUDIT_FAILED conversationId=${conversationId}`,
            );
          }
        }
      }
    }
    return result;
  }

  private async handleAction(
    conversation: Conversation & { lead?: Lead | null },
    action: ToolActionWire,
  ): Promise<'executed' | 'rejected'> {
    const parsed = parseAgentAction(action);
    if (!parsed) {
      this.logger.warn(
        `ACTION_CONTRACT_INVALID conversationId=${conversation.id}`,
      );
      return 'rejected';
    }
    const payload: Record<string, unknown> = parsed.payload;

    // Do not log the raw action payload to avoid leaking PII!
    this.logger.log(`ACTION_EXECUTE conversationId=${conversation.id}`);

    switch (parsed.type) {
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
        // The model may supply a reason or legacy IDs. Neither is authority
        // to choose a tenant, conversation, lead, or notification recipient.
        await this.handleHandoffToHuman(conversation);
        break;

      case 'SCHEDULE_FOLLOW_UP':
        if (
          typeof payload.scheduledAt !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
            payload.scheduledAt,
          ) ||
          isNaN(new Date(payload.scheduledAt).getTime()) ||
          (payload.context !== undefined &&
            (typeof payload.context !== 'string' ||
              payload.context.length > 500))
        ) {
          throw new Error('INVALID_FOLLOW_UP_ARGUMENTS');
        }
        await this.followUpService.scheduleAiFollowUp(
          conversation.organizationId,
          conversation.id,
          new Date(String(payload.scheduledAt)),
          typeof payload.context === 'string' ? payload.context : '',
        );
        break;

      default:
        this.logger.warn(
          `ACTION_TYPE_INVALID conversationId=${conversation.id}`,
        );
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

    await this.broadcastSafely('lead', conversation.id, () =>
      this.eventsGateway.broadcastLeadUpdate(
        conversation.organizationId,
        updatedLead,
      ),
    );
    this.logger.log(
      `✅ Lead ${conversation.leadId} updated for Conv: ${conversation.id}`,
    );

    if (
      updateData.status &&
      CRM_SYNC_STATUSES.includes(updateData.status as LeadStatus) &&
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
      } catch {
        this.logger.error(`CRM_SYNC_FAILED leadId=${updatedLead.id}`);
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

    await this.broadcastSafely('conversation', conversation.id, () =>
      this.eventsGateway.broadcastConversationUpdate(
        conversation.organizationId,
        updatedConversation,
      ),
    );
    this.logger.log(`✅ Conv ${conversation.id} paused.`);
  }

  private async handleNotifyAgent(
    conversation: Conversation & { lead?: Lead | null },
    payload: any,
  ) {
    const targetUserId = conversation.lead?.assignedAgentId;

    if (targetUserId) {
      const notification = await this.notificationEmitter.send({
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
      if (!notification) throw new Error('NO_ELIGIBLE_STAFF');
      this.logger.log(`NOTIFICATION_INTENT_COMMITTED userId=${targetUserId}`);
    } else {
      const memberships = await this.prisma.organizationMembership.findMany({
        where: {
          organizationId: conversation.organizationId,
          status: 'ACTIVE',
          deletedAt: null,
        },
      });
      let sent = 0;
      let failed = false;
      for (const membership of memberships) {
        try {
          const notification = await this.notificationEmitter.send({
            organizationId: conversation.organizationId,
            userId: membership.userId,
            type: NotificationType.LEAD_HANDED_OFF,
            title:
              typeof payload.title === 'string'
                ? payload.title
                : 'AI Escalation',
            body:
              typeof payload.body === 'string'
                ? payload.body
                : 'A conversation has been escalated by the AI.',
            referenceId: conversation.leadId || conversation.id,
            referenceType: conversation.leadId ? 'LEAD' : 'CONVERSATION',
          });
          if (notification) sent++;
        } catch {
          failed = true;
        }
      }
      if (sent === 0)
        throw new Error(
          failed ? 'NOTIFICATION_DELIVERY_FAILED' : 'NO_ELIGIBLE_STAFF',
        );
      this.logger.log(`NOTIFICATION_INTENT_COMMITTED count=${sent}`);
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
      await this.broadcastSafely('lead', conversation.id, () =>
        this.eventsGateway.broadcastLeadUpdate(
          conversation.organizationId,
          updatedLead,
        ),
      );
    } else {
      const newLead = await this.prisma.lead.create({
        data: {
          ...updateData,
          organizationId: conversation.organizationId,
          phoneNumber: conversation.externalContactId || 'Unknown',
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
      await this.broadcastSafely('lead', conversation.id, () =>
        this.eventsGateway.broadcastLeadUpdate(
          conversation.organizationId,
          newLead,
        ),
      );
    }
  }

  private async handleHandoffToHuman(
    conversation: Conversation & { lead?: Lead | null },
  ) {
    if (
      conversation.leadId &&
      (!conversation.lead ||
        conversation.lead.id !== conversation.leadId ||
        conversation.lead.organizationId !== conversation.organizationId)
    ) {
      throw new Error('HANDOFF_LEAD_TENANT_MISMATCH');
    }

    // A prior pause only counts as a handoff if staff notification is durable.
    if (conversation.aiPaused) {
      const existing = await this.prisma.notification.count({
        where: {
          organizationId: conversation.organizationId,
          type: 'LEAD_HANDED_OFF',
          referenceId: conversation.leadId ?? conversation.id,
        },
      });
      if (existing === 0) throw new Error('NO_ELIGIBLE_STAFF');
      this.logger.log(
        `Handoff already processed for Conv: ${conversation.id}. Ignoring duplicate.`,
      );
      return;
    }

    const leadId = conversation.leadId;
    const organizationId = conversation.organizationId;

    const { updatedConversation, updatedLead } = await this.prisma.$transaction(
      async (tx) => {
        const memberships = await tx.organizationMembership.findMany({
          where: {
            organizationId,
            status: 'ACTIVE',
            deletedAt: null,
            user: { status: 'ACTIVE', deletedAt: null },
          },
          include: MEMBERSHIP_GRANTS_INCLUDE,
        });
        const eligible = memberships.filter(
          (membership) =>
            membershipHasPermission(membership, 'notifications:view') &&
            (membership.userId === conversation.lead?.assignedAgentId ||
              membership.userId === conversation.assignedAgentId ||
              membershipHasPermission(membership, 'leads:read:all')),
        );
        if (eligible.length === 0) throw new Error('NO_ELIGIBLE_STAFF');
        const conv = await tx.conversation.update({
          where: { id: conversation.id, organizationId },
          data: { aiPaused: true, stateVersion: { increment: 1 } },
        });

        let lead: Lead | null = null;
        if (leadId) {
          lead = await tx.lead.update({
            where: { id: leadId, organizationId },
            data: { status: 'HANDED_OFF' },
          });
        }

        if (eligible.length > 0) {
          for (const membership of eligible) {
            const notification = await tx.notification.create({
              data: {
                organizationId: organizationId,
                userId: membership.userId,
                type: 'LEAD_HANDED_OFF',
                title: 'Human Intervention Required',
                body: `Requires human attention`,
                referenceId: lead ? lead.id : conv.id,
                referenceType: lead ? 'LEAD' : 'CONVERSATION',
              },
            });
            await tx.outboxEvent.create({
              data: {
                organizationId,
                topic: 'notification.broadcast',
                payload: { organizationId, notificationId: notification.id },
              },
            });
          }
        }
        return {
          updatedConversation: conv,
          updatedLead: lead,
        };
      },
    );

    // Notification rows and their delivery intents committed atomically.

    if (updatedLead) {
      await this.broadcastSafely('lead', conversation.id, () =>
        this.eventsGateway.broadcastLeadUpdate(organizationId, updatedLead),
      );
    }
    await this.broadcastSafely('conversation', conversation.id, () =>
      this.eventsGateway.broadcastConversationUpdate(
        organizationId,
        updatedConversation,
      ),
    );
  }

  private async broadcastSafely(
    event: 'lead' | 'conversation' | 'notification',
    conversationId: string,
    broadcast: () => void | Promise<void>,
  ): Promise<void> {
    try {
      await broadcast();
    } catch {
      // State and notifications have already committed. A live-delivery failure
      // must not trigger action replay, and provider errors may contain PII.
      this.logger.warn(
        `ACTION_BROADCAST_FAILED event=${event} conversationId=${conversationId}`,
      );
    }
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
      if (!AI_SETTABLE_STATUSES.includes(payload.status as LeadStatus)) {
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
      if (!Object.values(Priority).includes(payload.priority as Priority)) {
        throw new Error(`Invalid priority: ${payload.priority}`);
      }
      updateData.priority = payload.priority as Priority;
    }

    // Only allow specific string fields. Phone and email are never AI-editable:
    // phone is the routing/opt-out key and the manual-send target (KI-024).
    const stringFields = [
      'firstName',
      'lastName',
      'country',
      'primaryLanguage',
      'preferredLanguage',
      'gender',
      'timezone',
      'currency',
    ];
    for (const field of stringFields) {
      if (payload[field] !== undefined) {
        if (
          typeof payload[field] !== 'string' ||
          !payload[field].trim() ||
          payload[field].length > 500
        ) {
          throw new Error(`Invalid type for ${field}, expected string`);
        }
        if (
          field === 'gender' &&
          !Object.values(Gender).includes(payload[field] as Gender)
        )
          throw new Error('INVALID_GENDER');
        if (
          field === 'currency' &&
          !Object.values(Currency).includes(payload[field] as Currency)
        )
          throw new Error('INVALID_CURRENCY');
        updateData[field] = payload[field];
      }
    }

    return updateData;
  }
}
