export interface PublicMessageDto {
  id: string;
  conversationId: string;
  senderId: string | null;
  content: string;
  mediaUrl: string | null;
  type: string;
  handledBy: string;
  createdAt: string;
  updatedAt: string;
}

export function toPublicMessageDto(message: any): PublicMessageDto {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId || null,
    content: message.content,
    mediaUrl: message.mediaUrl || null,
    type: message.type,
    handledBy: message.handledBy,
    createdAt: message.createdAt instanceof Date ? message.createdAt.toISOString() : new Date(message.createdAt).toISOString(),
    updatedAt: message.updatedAt instanceof Date ? message.updatedAt.toISOString() : new Date(message.updatedAt).toISOString(),
  };
}

export interface PublicLeadDto {
  id: string;
  organizationId: string;
  assignedAgentId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phoneNumber: string;
  country: string;
  timezone: string;
  primaryLanguage: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  summary: string | null;
}

export function toPublicLeadDto(lead: any): PublicLeadDto {
  return {
    id: lead.id,
    organizationId: lead.organizationId,
    assignedAgentId: lead.assignedAgentId || null,
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email || null,
    phoneNumber: lead.phoneNumber,
    country: lead.country,
    timezone: lead.timezone,
    primaryLanguage: lead.primaryLanguage,
    status: lead.status,
    priority: lead.priority,
    summary: lead.summary || null,
    createdAt: lead.createdAt instanceof Date ? lead.createdAt.toISOString() : new Date(lead.createdAt).toISOString(),
    updatedAt: lead.updatedAt instanceof Date ? lead.updatedAt.toISOString() : new Date(lead.updatedAt).toISOString(),
  };
}

export interface PublicConversationDto {
  id: string;
  organizationId: string;
  externalContactId: string | null;
  status: string;
  leadId: string | null;
  aiPaused: boolean;
  assignedAgentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toPublicConversationDto(conversation: any): PublicConversationDto {
  return {
    id: conversation.id,
    organizationId: conversation.organizationId,
    externalContactId: conversation.externalContactId || null,
    status: conversation.status,
    leadId: conversation.leadId || null,
    aiPaused: !!conversation.aiPaused,
    assignedAgentId: conversation.assignedAgentId || null,
    createdAt: conversation.createdAt instanceof Date ? conversation.createdAt.toISOString() : new Date(conversation.createdAt).toISOString(),
    updatedAt: conversation.updatedAt instanceof Date ? conversation.updatedAt.toISOString() : new Date(conversation.updatedAt).toISOString(),
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

export function toPublicNotificationDto(notification: any): PublicNotificationDto {
  return {
    id: notification.id,
    organizationId: notification.organizationId,
    userId: notification.userId,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    isRead: !!notification.isRead,
    referenceId: notification.referenceId || null,
    referenceType: notification.referenceType || null,
    createdAt: notification.createdAt instanceof Date ? notification.createdAt.toISOString() : new Date(notification.createdAt).toISOString(),
  };
}
