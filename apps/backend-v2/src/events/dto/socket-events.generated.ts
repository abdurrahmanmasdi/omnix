// Public socket contract v1. Copied into Nest and Next by scripts/sync-agent-contract.py.
export interface LiveMessagePayload {
  id: string;
  conversationId: string;
  senderId: string | null;
  content: string;
  mediaUrl: string | null;
  type: string;
  handledBy: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface LeadUpdatePayload {
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
  summary: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationUpdatePayload {
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

export interface NotificationInvalidationPayload {
  id: string;
  organizationId: string;
  type: 'UPDATE';
  title: 'New notification';
  body: 'Open notifications to view details.';
}
