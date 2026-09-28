import type { Conversation, Lead, Message, Notification } from '@prisma/client';
import type {
  LiveMessagePayload, LeadUpdatePayload, ConversationUpdatePayload,
} from './socket-events.generated';

export type PublicMessageDto = LiveMessagePayload;
export type PublicLeadDto = LeadUpdatePayload;
export type PublicConversationDto = ConversationUpdatePayload;

export type MessageSource = Pick<Message, 'id' | 'conversationId' | 'content' | 'createdAt' | 'updatedAt'> &
  { senderId?: string | null; mediaUrl?: string | null; type?: string; handledBy?: string; status?: string };
export type LeadSource = Pick<Lead, 'id' | 'firstName' | 'lastName' | 'createdAt' | 'updatedAt'> &
  { organizationId?: string; assignedAgentId?: string | null; email?: string | null;
    phoneNumber?: string; country?: string; timezone?: string; primaryLanguage?: string;
    status?: string; priority?: string; summary?: string | null };
export type ConversationSource = Pick<Conversation, 'id' | 'createdAt' | 'updatedAt'> &
  Partial<Pick<Conversation, 'organizationId' | 'externalContactId' | 'status' |
    'leadId' | 'aiPaused' | 'assignedAgentId'>> &
  { lead?: unknown };
type NotificationSource = Pick<Notification, 'id' | 'title' | 'body' | 'createdAt'> & { type: string } &
  Partial<Pick<Notification, 'organizationId' | 'userId' | 'isRead' | 'referenceId' | 'referenceType'>>;

const iso = (value: Date | string) => new Date(value).toISOString();

export function toPublicMessageDto(message: MessageSource): PublicMessageDto {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId ?? null,
    content: message.content,
    mediaUrl: message.mediaUrl ?? null,
    type: message.type ?? 'USER_TEXT',
    handledBy: message.handledBy ?? 'AI',
    status: message.status ?? 'PENDING',
    createdAt: iso(message.createdAt),
    updatedAt: iso(message.updatedAt),
  };
}

export function toPublicLeadDto(lead: LeadSource): PublicLeadDto {
  return {
    id: lead.id,
    organizationId: lead.organizationId ?? '',
    assignedAgentId: lead.assignedAgentId ?? null,
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email ?? null,
    phoneNumber: lead.phoneNumber ?? '',
    country: lead.country ?? '',
    timezone: lead.timezone ?? '',
    primaryLanguage: lead.primaryLanguage ?? '',
    status: lead.status ?? 'NEW',
    priority: lead.priority ?? 'WARM',
    summary: lead.summary ?? null,
    createdAt: iso(lead.createdAt),
    updatedAt: iso(lead.updatedAt),
  };
}

export function toPublicConversationDto(conversation: ConversationSource): PublicConversationDto {
  return {
    id: conversation.id,
    organizationId: conversation.organizationId ?? '',
    externalContactId: conversation.externalContactId ?? null,
    status: conversation.status ?? 'ACTIVE',
    leadId: conversation.leadId ?? null,
    aiPaused: conversation.aiPaused ?? false,
    assignedAgentId: conversation.assignedAgentId ?? null,
    createdAt: iso(conversation.createdAt),
    updatedAt: iso(conversation.updatedAt),
  };
}

export interface PublicNotificationDto {
  id: string;
  organizationId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  referenceId: string | null;
  referenceType: string | null;
  createdAt: string;
}

export function toPublicNotificationDto(notification: NotificationSource): PublicNotificationDto {
  return {
    id: notification.id,
    organizationId: notification.organizationId ?? '',
    userId: notification.userId ?? '',
    type: notification.type,
    title: notification.title,
    body: notification.body,
    isRead: notification.isRead ?? false,
    referenceId: notification.referenceId ?? null,
    referenceType: notification.referenceType ?? null,
    createdAt: iso(notification.createdAt),
  };
}
