import { Test, TestingModule } from '@nestjs/testing';
import { ActionExecutorService } from './action-executor.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationEmitterService } from '../notifications/notification-emitter.service';
import { EventsGateway } from '../events/events/events.gateway';
import { CrmIntegrationService } from '../modules/integration/crm/crm-integration.service';
import { FollowUpService } from '../follow-ups/follow-up.service';
import { LeadStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { Logger } from '@nestjs/common';

describe('ActionExecutorService', () => {
  let service: ActionExecutorService;
  let prismaService: PrismaService;
  let eventsGateway: EventsGateway;
  let auditService: AuditService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActionExecutorService,
        {
          provide: AuditService,
          useValue: { record: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: PrismaService,
          useValue: {
            conversation: {
              findFirst: jest.fn(),
              update: jest.fn(),
            },
            lead: {
              update: jest.fn(),
              create: jest.fn(),
            },
            $transaction: jest.fn(),
            notification: {
              create: jest.fn(),
              count: jest.fn().mockResolvedValue(1),
            },
            outboxEvent: {
              create: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
            },
            organizationMembership: {
              findMany: jest.fn().mockResolvedValue([
                {
                  userId: 'staff-1',
                  role: {
                    rolePermissions: [
                      { permission: { action: 'notifications:view' } },
                      { permission: { action: 'leads:read:all' } },
                    ],
                  },
                  permissionOverrides: [],
                },
              ]),
            },
          },
        },
        {
          provide: NotificationEmitterService,
          useValue: { send: jest.fn() },
        },
        {
          provide: EventsGateway,
          useValue: {
            broadcastLeadUpdate: jest.fn(),
            broadcastConversationUpdate: jest.fn(),
            broadcastNotification: jest.fn(),
          },
        },
        {
          provide: CrmIntegrationService,
          useValue: { syncLeadToExternalCrm: jest.fn() },
        },
        {
          provide: FollowUpService,
          useValue: { scheduleAiFollowUp: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<ActionExecutorService>(ActionExecutorService);
    prismaService = module.get<PrismaService>(PrismaService);
    eventsGateway = module.get<EventsGateway>(EventsGateway);
    auditService = module.get<AuditService>(AuditService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handoff contract', () => {
    const conversation = {
      id: 'trusted-conv',
      organizationId: 'org-1',
      leadId: 'lead-1',
      lead: { id: 'lead-1', organizationId: 'org-1', status: LeadStatus.NEW },
      aiPaused: false,
    };

    const handoff = (payload = '{}') =>
      service.executeActions('org-1', 'trusted-conv', [
        { type: 'HANDOFF_TO_HUMAN', payload },
      ]);

    beforeEach(() => {
      (prismaService.conversation.findFirst as jest.Mock).mockResolvedValue(
        conversation,
      );
      (prismaService.conversation.update as jest.Mock).mockResolvedValue({
        ...conversation,
        aiPaused: true,
      });
      (prismaService.lead.update as jest.Mock).mockResolvedValue({
        ...conversation.lead,
        status: LeadStatus.HANDED_OFF,
      });
      (prismaService.notification.create as jest.Mock).mockImplementation(
        ({ data }) => Promise.resolve({ id: 'notification-1', ...data }),
      );
      (prismaService.$transaction as jest.Mock).mockImplementation((callback) =>
        callback(prismaService),
      );
    });

    it('persists the pause, lead state, notification and relay intent together', async () => {
      expect(await handoff()).toMatchObject({
        executed: 1,
        rejected: 0,
        failed: 0,
      });
      expect(prismaService.conversation.update).toHaveBeenCalledWith({
        where: { id: 'trusted-conv', organizationId: 'org-1' },
        data: { aiPaused: true, stateVersion: { increment: 1 } },
      });
      expect(prismaService.lead.update).toHaveBeenCalledWith({
        where: { id: 'lead-1', organizationId: 'org-1' },
        data: { status: 'HANDED_OFF' },
      });
      expect(prismaService.notification.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          userId: 'staff-1',
          type: 'LEAD_HANDED_OFF',
          title: 'Human Intervention Required',
          body: 'Requires human attention',
          referenceId: 'lead-1',
          referenceType: 'LEAD',
        },
      });
      expect(prismaService.outboxEvent.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          topic: 'notification.broadcast',
          payload: {
            organizationId: 'org-1',
            notificationId: 'notification-1',
          },
        },
      });
      expect(eventsGateway.broadcastNotification).not.toHaveBeenCalled();
      expect(auditService.record).not.toHaveBeenCalled();
    });

    it.each(['{', 'null', '[]', '"handoff"', 'true', '12'])(
      'rejects malformed or non-object payload %s before writes',
      async (payload) => {
        expect(await handoff(payload)).toMatchObject({
          executed: 0,
          rejected: 1,
          failed: 0,
        });
        expect(prismaService.$transaction).not.toHaveBeenCalled();
        expect(eventsGateway.broadcastNotification).not.toHaveBeenCalled();
      },
    );

    it('rejects model-supplied tenant, lead or recipient IDs', async () => {
      expect(
        await handoff(
          JSON.stringify({
            organizationId: 'org-2',
            conversationId: 'other-conv',
            lead_id: 'other-lead',
            userId: 'other-staff',
            reason: 'Requested staff',
          }),
        ),
      ).toMatchObject({ executed: 0, rejected: 1, failed: 0 });
      expect(prismaService.conversation.findFirst).toHaveBeenCalledWith({
        where: { id: 'trusted-conv', organizationId: 'org-1' },
        include: { lead: true },
      });
      expect(prismaService.lead.update).not.toHaveBeenCalled();
      expect(
        prismaService.organizationMembership.findMany,
      ).not.toHaveBeenCalled();
    });

    it('does not hand off a conversation outside the worker tenant', async () => {
      (prismaService.conversation.findFirst as jest.Mock).mockResolvedValue(
        null,
      );
      expect(await handoff()).toMatchObject({
        executed: 0,
        rejected: 0,
        failed: 1,
        outcomes: [{ reasonCode: 'CONVERSATION_NOT_FOUND', retryable: false }],
      });
      expect(prismaService.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a cross-tenant linked lead before writes', async () => {
      (prismaService.conversation.findFirst as jest.Mock).mockResolvedValue({
        ...conversation,
        lead: { ...conversation.lead, organizationId: 'org-2' },
      });
      expect(await handoff()).toMatchObject({
        executed: 0,
        rejected: 0,
        failed: 1,
      });
      expect(prismaService.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a handoff with no eligible staff before pausing', async () => {
      (
        prismaService.organizationMembership.findMany as jest.Mock
      ).mockResolvedValue([]);
      expect(await handoff()).toMatchObject({
        executed: 0,
        rejected: 0,
        failed: 1,
        outcomes: [{ reasonCode: 'NO_ELIGIBLE_STAFF', retryable: true }],
      });
      expect(prismaService.conversation.update).not.toHaveBeenCalled();
      expect(prismaService.notification.create).not.toHaveBeenCalled();
      expect(eventsGateway.broadcastNotification).not.toHaveBeenCalled();
      expect(auditService.record).toHaveBeenCalledWith({
        organizationId: 'org-1',
        action: 'ai.handoff_failed_no_staff',
        targetId: 'trusted-conv',
        actor: 'ai',
        metadata: { reason: 'NO_ELIGIBLE_STAFF' },
      });
    });

    it('does not notify staff without visibility of the handed-off lead', async () => {
      (
        prismaService.organizationMembership.findMany as jest.Mock
      ).mockResolvedValue([
        {
          userId: 'unassigned-staff',
          role: {
            rolePermissions: [{ permission: { action: 'notifications:view' } }],
          },
          permissionOverrides: [],
        },
      ]);
      expect(await handoff()).toMatchObject({
        executed: 0,
        rejected: 0,
        failed: 1,
      });
      expect(prismaService.notification.create).not.toHaveBeenCalled();
      expect(eventsGateway.broadcastNotification).not.toHaveBeenCalled();
    });

    it('uses the conversation reference when there is no linked lead', async () => {
      (prismaService.conversation.findFirst as jest.Mock).mockResolvedValue({
        ...conversation,
        leadId: null,
        lead: null,
      });
      expect(await handoff()).toMatchObject({
        executed: 1,
        rejected: 0,
        failed: 0,
      });
      expect(prismaService.lead.update).not.toHaveBeenCalled();
      expect(prismaService.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          referenceId: 'trusted-conv',
          referenceType: 'CONVERSATION',
        }),
      });
    });

    it('reports lead and conversation broadcast failures without replaying committed actions', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      (eventsGateway.broadcastNotification as jest.Mock).mockImplementation(
        () => {
          throw new Error('Sensitive transport detail');
        },
      );
      (eventsGateway.broadcastLeadUpdate as jest.Mock).mockRejectedValue(
        new Error('Sensitive transport detail'),
      );
      (
        eventsGateway.broadcastConversationUpdate as jest.Mock
      ).mockRejectedValue(new Error('Sensitive transport detail'));
      expect(await handoff()).toMatchObject({
        executed: 1,
        rejected: 0,
        failed: 0,
      });
      for (const event of ['lead', 'conversation']) {
        expect(warn).toHaveBeenCalledWith(
          `ACTION_BROADCAST_FAILED event=${event} conversationId=trusted-conv`,
        );
      }
      expect(warn).toHaveBeenCalledTimes(2);
      expect(prismaService.notification.create).toHaveBeenCalledTimes(1);
    });

    it('reports a transaction failure and does not emit a notification', async () => {
      (prismaService.$transaction as jest.Mock).mockRejectedValue(
        new Error('Transaction failed'),
      );
      expect(await handoff()).toMatchObject({
        executed: 0,
        rejected: 0,
        failed: 1,
      });
      expect(eventsGateway.broadcastNotification).not.toHaveBeenCalled();
      expect(eventsGateway.broadcastLeadUpdate).not.toHaveBeenCalled();
      expect(eventsGateway.broadcastConversationUpdate).not.toHaveBeenCalled();
    });

    it('preserves duplicate handling for an already paused conversation', async () => {
      (prismaService.conversation.findFirst as jest.Mock).mockResolvedValue({
        ...conversation,
        aiPaused: true,
      });
      expect(await handoff()).toMatchObject({
        executed: 1,
        rejected: 0,
        failed: 0,
      });
      expect(prismaService.$transaction).not.toHaveBeenCalled();
      expect(eventsGateway.broadcastNotification).not.toHaveBeenCalled();
    });
  });

  describe('executeActions', () => {
    it('An action cannot forge patient media consent', async () => {
      const actions = [
        {
          type: 'UPDATE_LEAD',
          payload: JSON.stringify({
            mediaConsentGranted: true,
            status: 'QUALIFIED',
          }),
        },
      ];

      (prismaService.conversation.findFirst as jest.Mock).mockResolvedValue({
        id: 'trusted-conv',
        organizationId: 'org-1',
        leadId: 'lead-1',
        lead: { status: 'NEW' },
        aiPaused: false,
      });

      (prismaService.lead.update as jest.Mock).mockResolvedValue({
        id: 'lead-1',
        externalContactId: 'existing-contact',
      });
      expect(
        await service.executeActions('org-1', 'trusted-conv', actions),
      ).toMatchObject({ executed: 0, rejected: 1, failed: 0 });
      expect(prismaService.lead.update).not.toHaveBeenCalled();
    });

    it('rejects an action containing a model-supplied conversation ID', async () => {
      // The model returns an action with a different conversationId in payload
      const actions = [
        {
          type: 'PAUSE_CONVERSATION',
          payload: JSON.stringify({ conversationId: 'other-conv' }),
        },
      ];

      // The processor calls with the trusted ID 'trusted-conv'
      (prismaService.conversation.findFirst as jest.Mock).mockResolvedValue({
        id: 'trusted-conv',
        organizationId: 'org-1',
        aiPaused: false,
      });
      (prismaService.conversation.update as jest.Mock).mockResolvedValue({});

      const result = await service.executeActions(
        'org-1',
        'trusted-conv',
        actions,
      );
      expect(result.executed).toBe(0);
      expect(result.rejected).toBe(1);
      expect(result.failed).toBe(0);

      expect(prismaService.conversation.update).not.toHaveBeenCalled();
    });

    it('An action cannot mutate a lead from another organization', async () => {
      const actions = [
        {
          type: 'UPDATE_LEAD',
          payload: JSON.stringify({ status: LeadStatus.QUALIFIED }),
        },
      ];

      // Simulate that findFirst returns null because the conversation does not belong to the org
      (prismaService.conversation.findFirst as jest.Mock).mockResolvedValue(
        null,
      );

      const result = await service.executeActions(
        'wrong-org',
        'trusted-conv',
        actions,
      );
      expect(result.executed).toBe(0);
      expect(result.failed).toBe(1); // Failed because context could not be loaded

      expect(prismaService.lead.update).not.toHaveBeenCalled();
    });

    it('Invalid status/priority values are rejected before Prisma is called', async () => {
      // payload with invalid status and priority
      const actions = [
        {
          type: 'UPDATE_LEAD',
          payload: JSON.stringify({
            status: 'SUPER_HOT',
            priority: 'MEGA_HIGH',
          }),
        },
      ];

      (prismaService.conversation.findFirst as jest.Mock).mockResolvedValue({
        id: 'trusted-conv',
        organizationId: 'org-1',
        leadId: 'lead-1',
        lead: { status: LeadStatus.NEW },
      });

      const result = await service.executeActions(
        'org-1',
        'trusted-conv',
        actions,
      );

      // The contract boundary rejects the action before invoking Prisma.
      expect(result.executed).toBe(0);
      expect(result.rejected).toBe(1);
      expect(result.outcomes[0]).toMatchObject({
        reasonCode: 'ACTION_INVALID',
        retryable: false,
      });

      // Verify Prisma was never called for update
      expect(prismaService.lead.update).not.toHaveBeenCalled();
    });

    it('A valid action updates only the lead attached to the trusted conversation', async () => {
      const actions = [
        {
          type: 'UPDATE_LEAD',
          payload: JSON.stringify({ status: LeadStatus.QUALIFYING }),
        },
      ];

      (prismaService.conversation.findFirst as jest.Mock).mockResolvedValue({
        id: 'trusted-conv',
        organizationId: 'org-1',
        leadId: 'lead-1',
        lead: { status: LeadStatus.NEW },
      });

      (prismaService.lead.update as jest.Mock).mockResolvedValue({
        id: 'lead-1',
      });

      const result = await service.executeActions(
        'org-1',
        'trusted-conv',
        actions,
      );
      expect(result.executed).toBe(1);
      expect(result.failed).toBe(0);

      // Verify it updated lead-1
      expect(prismaService.lead.update).toHaveBeenCalledWith({
        where: { id: 'lead-1' },
        data: { status: LeadStatus.QUALIFYING },
      });
    });

    it('ensures a failed action cannot generate a success promise', async () => {
      (prismaService.conversation.findFirst as jest.Mock).mockResolvedValue({
        id: 'trusted-conv',
        organizationId: 'org-1',
        leadId: 'lead-1',
        lead: { status: 'NEW' },
      });
      (prismaService.lead.update as jest.Mock).mockRejectedValue(
        new Error('Synthetic DB Error'),
      );

      const result = await service.executeActions('org-1', 'trusted-conv', [
        {
          type: 'UPDATE_LEAD',
          payload: JSON.stringify({ status: 'QUALIFYING' }),
        },
      ]);
      expect(result.executed).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.outcomes[0].status).toBe('FAILED');
      expect(result.outcomes[0].retryable).toBe(true);
    });

    it('classifies a rejected database lead update as retryable', async () => {
      (prismaService.conversation.findFirst as jest.Mock).mockResolvedValue({
        id: 'trusted-conv',
        organizationId: 'org-1',
        leadId: 'lead-1',
        lead: { status: LeadStatus.NEW },
      });
      (prismaService.lead.update as jest.Mock).mockRejectedValue(
        new Error('synthetic database outage'),
      );
      const result = await service.executeActions('org-1', 'trusted-conv', [
        {
          type: 'UPDATE_LEAD',
          payload: JSON.stringify({ status: LeadStatus.QUALIFYING }),
        },
      ]);
      expect(result).toMatchObject({
        executed: 0,
        rejected: 0,
        failed: 1,
        outcomes: [{ reasonCode: 'ACTION_WRITE_FAILED', retryable: true }],
      });
    });

    it('Enforces lead status transition matrix (rejects WON -> QUALIFYING)', async () => {
      const actions = [
        {
          type: 'UPDATE_LEAD',
          payload: JSON.stringify({ status: LeadStatus.QUALIFYING }),
        },
      ];

      (prismaService.conversation.findFirst as jest.Mock).mockResolvedValue({
        id: 'trusted-conv',
        organizationId: 'org-1',
        leadId: 'lead-1',
        lead: { status: LeadStatus.WON },
      });

      const result = await service.executeActions(
        'org-1',
        'trusted-conv',
        actions,
      );

      // Should fail transition validation
      expect(result.executed).toBe(0);
      expect(result.failed).toBe(1);

      expect(prismaService.lead.update).not.toHaveBeenCalled();
    });

    // WP-A A12 (KI-024): the AI cannot change phone/email or set staff-only statuses.
    it.each([
      [{ phoneNumber: '+15550000000' }],
      [{ email: 'synthetic@example.invalid' }],
      [{ status: LeadStatus.WON }],
      [{ status: LeadStatus.LOST }],
      [{ status: LeadStatus.READY_TO_PAY }],
      [{ status: LeadStatus.UNQUALIFIED }],
      [{ status: LeadStatus.NEW }],
    ])('rejects AI lead update %j before Prisma is called', async (payload) => {
      (prismaService.conversation.findFirst as jest.Mock).mockResolvedValue({
        id: 'trusted-conv',
        organizationId: 'org-1',
        leadId: 'lead-1',
        lead: { status: LeadStatus.QUALIFIED },
      });
      const result = await service.executeActions('org-1', 'trusted-conv', [
        { type: 'UPDATE_LEAD', payload: JSON.stringify(payload) },
      ]);
      expect(result).toMatchObject({ executed: 0, rejected: 1, failed: 0 });
      expect(prismaService.lead.update).not.toHaveBeenCalled();
    });

    it('still lets the AI mark a lead QUALIFIED', async () => {
      (prismaService.conversation.findFirst as jest.Mock).mockResolvedValue({
        id: 'trusted-conv',
        organizationId: 'org-1',
        leadId: 'lead-1',
        lead: { status: LeadStatus.QUALIFYING },
      });
      (prismaService.lead.update as jest.Mock).mockResolvedValue({
        id: 'lead-1',
      });
      const result = await service.executeActions('org-1', 'trusted-conv', [
        {
          type: 'UPDATE_LEAD',
          payload: JSON.stringify({ status: LeadStatus.QUALIFIED }),
        },
      ]);
      expect(result).toMatchObject({ executed: 1, rejected: 0, failed: 0 });
      expect(prismaService.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: LeadStatus.QUALIFIED } }),
      );
    });
  });
});
