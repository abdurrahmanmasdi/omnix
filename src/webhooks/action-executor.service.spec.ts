import { Test, TestingModule } from '@nestjs/testing';
import { ActionExecutorService } from './action-executor.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationEmitterService } from '../notifications/notification-emitter.service';
import { EventsGateway } from '../events/events/events.gateway';
import { CrmIntegrationService } from '../modules/integration/crm/crm-integration.service';
import { FollowUpService } from '../follow-ups/follow-up.service';
import { LeadStatus, Priority } from '@prisma/client';
import { PermissionService } from '../auth/permission.service';

describe('ActionExecutorService', () => {
  let service: ActionExecutorService;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActionExecutorService,
        {
          provide: require('../audit/audit.service').AuditService,
          useValue: { log: jest.fn() },
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
            organizationMembership: {
              findMany: jest
                .fn()
                .mockResolvedValue([
                  {
                    provide: PermissionService,
                    useValue: { has: jest.fn().mockResolvedValue(true) },
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
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('executeActions', () => {
    it('An action containing a different conversation ID cannot update that conversation', async () => {
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
      expect(result.executed).toBe(1);
      expect(result.failed).toBe(0);

      // Verify that it updated 'trusted-conv', ignoring 'other-conv'
      expect(prismaService.conversation.update).toHaveBeenCalledWith({
        where: { id: 'trusted-conv' },
        data: { aiPaused: true, stateVersion: { increment: 1 } },
      });
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

      // The action itself fails due to validation
      expect(result.executed).toBe(0);
      expect(result.failed).toBe(1);

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

    it('Enforces lead status transition matrix (rejects WON -> NEW)', async () => {
      const actions = [
        {
          type: 'UPDATE_LEAD',
          payload: JSON.stringify({ status: LeadStatus.NEW }),
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
  });
});
