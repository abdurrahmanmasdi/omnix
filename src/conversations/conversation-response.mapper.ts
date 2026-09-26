import { Conversation, Lead, Message } from '@prisma/client';
import { toPublicMessageDto } from '../events/dto/public-events.dto';

type ConversationRow = Conversation & {
  lead: Lead | null;
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
    assignedAgentId: conversation.assignedAgentId,
    externalContactId: canReadPii ? conversation.externalContactId : null,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
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
          assignedAgentId: lead.assignedAgentId,
        }
      : null,
    messages: canReadMessages
      ? conversation.messages.map(toPublicMessageDto)
      : [],
  };
}
