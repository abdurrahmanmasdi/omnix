import { Test } from '@nestjs/testing';
import { ConversationsService } from './conversations.service';
import { PrismaService } from '../prisma/prisma.service';
import { OutboundAttemptService } from '../webhooks/outbound-attempt.service';
import { EventsGateway } from '../events/events/events.gateway';
import { PermissionService } from '../auth/permission.service';

// Synthetic rows only; queries and permission boundaries are observable here.
describe('Inbox reads', () => {
  const prisma = {
    conversation: { findMany: jest.fn(), findUnique: jest.fn() },
    message: { findMany: jest.fn() },
  };
  const permission = { has: jest.fn() };
  let service: ConversationsService;
  beforeEach(async () => {
    jest.clearAllMocks();
    permission.has.mockResolvedValue(true);
    prisma.conversation.findMany.mockResolvedValue([]);
    const module = await Test.createTestingModule({
      providers: [
        ConversationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PermissionService, useValue: permission },
        { provide: OutboundAttemptService, useValue: {} },
        { provide: EventsGateway, useValue: {} },
      ],
    }).compile();
    service = module.get(ConversationsService);
  });
  it('pages on the server beyond 100 with a deterministic tie-breaker', async () => {
    await service.getConversations('org', 'staff', 6, 20);
    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 100,
        take: 20,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });
  it.each(['needs_reply', 'handed_off', 'ai_active', 'mine', 'unassigned'])(
    'applies %s before pagination',
    async (filter) => {
      await service.getConversations('org', 'staff', 1, 20, filter);
      const query = prisma.conversation.findMany.mock.calls[0][0];
      expect(query.where.AND).toHaveLength(1);
      expect(query.where.organizationId).toBe('org');
    },
  );
  it('never lets the unassigned filter widen assigned-only access', async () => {
    permission.has.mockImplementation(
      (_user: string, _org: string, key: string) =>
        Promise.resolve(key !== 'leads:read:all'),
    );
    await service.getConversations('org', 'staff', 1, 20, 'unassigned');
    expect(prisma.conversation.findMany.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ lead: { assignedAgentId: 'staff' } }),
    );
  });
  it('rejects history permission failures', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      organizationId: 'org',
      lead: { assignedAgentId: 'staff' },
    });
    permission.has.mockResolvedValue(false);
    await expect(
      service.getMessages('org', 'staff', 'conv'),
    ).rejects.toMatchObject({ status: 403 });
    expect(prisma.message.findMany).not.toHaveBeenCalled();
  });
  it('returns a cursor page and preserves UNKNOWN across reload', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      organizationId: 'org',
      lead: null,
    });
    const row = {
      id: 'm1',
      conversationId: 'conv',
      content: 'synthetic',
      type: 'USER_TEXT',
      status: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date(),
      outboundAttempt: { status: 'UNKNOWN' },
    };
    prisma.message.findMany.mockResolvedValue([row, { ...row, id: 'm2' }]);
    const result = await service.getMessages(
      'org',
      'staff',
      'conv',
      'cursor',
      1,
    );
    expect(result).toMatchObject({
      data: [{ id: 'm1', status: 'UNKNOWN' }],
      hasMore: true,
      nextCursor: 'm1',
    });
    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { id: 'cursor' }, skip: 1 }),
    );
  });
  it('reads current detail independently of the first list page and redacts preview/summary', async () => {
    const now = new Date('2026-10-03T10:00:00Z');
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'beyond-100',
      organizationId: 'org',
      aiPaused: true,
      stateVersion: 15,
      createdAt: now,
      updatedAt: now,
      messages: [],
      lead: {
        id: 'patient',
        firstName: 'Synthetic',
        lastName: 'Patient',
        phoneNumber: '+905550001234',
        email: 'synthetic@example.invalid',
        summary: 'Synthetic private summary',
        assignedAgentId: 'staff',
        optedOutAt: now,
      },
    });
    permission.has.mockImplementation(
      (_user: string, _org: string, key: string) =>
        Promise.resolve(key === 'leads:read:all'),
    );
    const result = await service.getConversation('org', 'staff', 'beyond-100');
    expect(result).toMatchObject({
      id: 'beyond-100',
      aiPaused: true,
      stateVersion: 15,
      messages: [],
      lead: {
        phoneNumber: '+********1234',
        email: null,
        summary: null,
        optedOut: true,
      },
    });
    expect(prisma.conversation.findMany).not.toHaveBeenCalled();
  });
  it('rejects detail outside the tenant or assigned-only access', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      organizationId: 'other-org',
    });
    await expect(
      service.getConversation('org', 'staff', 'conv'),
    ).rejects.toMatchObject({ status: 404 });
    prisma.conversation.findUnique.mockResolvedValue({
      organizationId: 'org',
      lead: { assignedAgentId: 'other-staff' },
    });
    permission.has.mockResolvedValue(false);
    await expect(
      service.getConversation('org', 'staff', 'conv'),
    ).rejects.toMatchObject({ status: 403 });
  });
});
