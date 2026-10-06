import { Conversation, Lead, Message, Prisma } from '@prisma/client';
import { toPublicMessageDto } from '../events/dto/public-events.dto';

type ConversationRow = Conversation & {
  lead:
    | (Lead & {
        assignedAgent?: { firstName: string; lastName: string } | null;
        pipelineStage?: { name: string } | null;
      })
    | null;
  messages: Message[];
};

export function toConversationResponse(
  conversation: ConversationRow,
  canReadPii: boolean,
  canReadMessages: boolean,
) {
  const lead = conversation.lead;
  return {
    id: conversation.id,
    organizationId: conversation.organizationId,
    leadId: conversation.leadId,
    channelId: conversation.channelId,
    status: conversation.status,
    aiPaused: conversation.aiPaused,
    stateVersion: conversation.stateVersion,
    assignedAgentId: conversation.assignedAgentId,
    externalContactId: canReadPii ? conversation.externalContactId : null,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    lead: lead
      ? {
          id: lead.id,
          firstName: lead.firstName,
          lastName: lead.lastName,
          phoneNumber: canReadPii
            ? lead.phoneNumber
            : lead.phoneNumber.replace(/\d(?=\d{4})/g, '*'),
          email: canReadPii ? lead.email : null,
          status: lead.status,
          priority: lead.priority,
          primaryLanguage: lead.primaryLanguage,
          country: lead.country,
          timezone: lead.timezone,
          optedOut: !!lead.optedOutAt,
          pipelineStageId: lead.pipelineStageId,
          stageName: lead.pipelineStage?.name ?? null,
          assigneeName: lead.assignedAgent
            ? `${lead.assignedAgent.firstName} ${lead.assignedAgent.lastName}`.trim()
            : null,
          // Summaries can contain patient PII copied from the transcript.
          summary: canReadPii && canReadMessages ? lead.summary : null,
          assignedAgentId: lead.assignedAgentId,
        }
      : null,
    messages: canReadMessages ? conversation.messages.map(toInboxMessage) : [],
  };
}

export const INBOX_LEAD_INCLUDE = {
  assignedAgent: { select: { firstName: true, lastName: true } },
  pipelineStage: { select: { name: true } },
} satisfies Prisma.LeadInclude;

export function toInboxMessage(
  message: Message & { outboundAttempt?: { status: string } | null },
) {
  const dto = toPublicMessageDto(message);
  if (message.outboundAttempt?.status === 'UNKNOWN') dto.status = 'UNKNOWN';
  const origin = (message.metadata as Prisma.JsonObject | null)?.origin;
  return {
    ...dto,
    ...(origin === 'WHATSAPP_PHONE' || origin === 'WHATSAPP_HISTORY'
      ? { origin }
      : {}),
  };
}
