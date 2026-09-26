import { Prisma } from '@prisma/client';

export const LEAD_RELATIONS_INCLUDE = {
  assignedAgent: {
    select: { id: true, firstName: true, lastName: true },
  },
  source: { select: { id: true, name: true } },
  pipelineStage: { select: { id: true, name: true, orderIndex: true } },
  conversation: {
    select: { id: true, status: true, createdAt: true, updatedAt: true },
  },
} as const;

type LeadRow = Prisma.LeadGetPayload<{
  include: typeof LEAD_RELATIONS_INCLUDE;
}>;

export function toLeadResponse(lead: LeadRow, canReadPii: boolean) {
  const [emailLocal, emailDomain] = lead.email?.split('@') ?? [];
  return {
    id: lead.id,
    organizationId: lead.organizationId,
    firstName: lead.firstName,
    lastName: lead.lastName,
    nativeName: canReadPii ? lead.nativeName : null,
    phoneNumber: canReadPii
      ? lead.phoneNumber
      : lead.phoneNumber.replace(/\d(?=\d{4})/g, '*'),
    email: canReadPii
      ? lead.email
      : emailDomain
        ? `${emailLocal.slice(0, 2)}***@${emailDomain}`
        : null,
    socialLinks: canReadPii ? lead.socialLinks : null,
    gender: lead.gender,
    country: lead.country,
    timezone: lead.timezone,
    primaryLanguage: lead.primaryLanguage,
    preferredLanguage: lead.preferredLanguage,
    summary: null,
    status: lead.status,
    priority: lead.priority,
    estimatedValue: lead.estimatedValue,
    currency: lead.currency,
    expectedServiceDate: lead.expectedServiceDate,
    nextFollowUpAt: lead.nextFollowUpAt,
    sourceId: lead.sourceId,
    pipelineStageId: lead.pipelineStageId,
    assignedAgentId: lead.assignedAgentId,
    assignedAgent: lead.assignedAgent,
    source: lead.source,
    pipelineStage: lead.pipelineStage,
    conversation: lead.conversation,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
  };
}
