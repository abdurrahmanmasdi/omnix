// @ts-nocheck
import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksProcessor } from './webhooks.processor';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationEmitterService } from '../notifications/notification-emitter.service';
import { WhatsappService } from './whatsapp.service';
import { WhatsappMediaService } from './whatsapp-media.service';
import { EventsGateway } from '../events/events/events.gateway';
import { getQueueToken } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { tenantStorage } from '../core/tenant/tenant.context';
import { FollowUpService } from '../follow-ups/follow-up.service';
import { AuditService } from '../audit/audit.service';
import { CredentialsService } from '../credentials/credentials.service';
import { ActionExecutorService } from './action-executor.service';
import { PermissionService } from '../auth/permission.service';

describe('WebhooksProcessor', () => {
  it('should ask for consent and not download media if consent is not granted', async () => {
    (prisma.channel.findFirst as jest.Mock).mockResolvedValue({
      id: 'channel-1',
      organizationId: 'org-1',
      accessToken: 'token-123',
      organization: { id: 'org-1' },
    });
    (prisma.lead.findFirst as jest.Mock).mockResolvedValue({
      id: 'lead-1',
      mediaConsentGranted: false,
    });
    (prisma.conversation.findFirst as jest.Mock).mockResolvedValue({
      id: 'conv-1',
      leadId: 'lead-1',
      lead: { mediaConsentGranted: false },
    });
    (prisma.message.findUnique as jest.Mock).mockResolvedValue(null);

    const job = {
      data: {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { display_phone_number: '123' },
                  messages: [
                    {
                      from: '456',
                      id: 'msg-media-1',
                      timestamp: '123456789',
                      type: 'image',
                      image: { id: 'img-1' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    } as any;

    await processor.process(job);

    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: '[Patient Media - Consent Required]',
          mediaUrl: null,
        }),
      }),
    );
  });

  it('should update consent status if user sends I CONSENT', async () => {
    (prisma.channel.findFirst as jest.Mock).mockResolvedValue({
      id: 'channel-1',
      organizationId: 'org-1',
      accessToken: 'token-123',
      organization: { id: 'org-1' },
    });
    (prisma.lead.findFirst as jest.Mock).mockResolvedValue({
      id: 'lead-1',
      mediaConsentGranted: false,
    });
    (prisma.conversation.findFirst as jest.Mock).mockResolvedValue({
      id: 'conv-1',
      leadId: 'lead-1',
      lead: { mediaConsentGranted: false },
    });
    (prisma.message.findUnique as jest.Mock).mockResolvedValue(null);

    const job = {
      data: {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { display_phone_number: '123' },
                  messages: [
                    {
                      from: '456',
                      id: 'msg-consent-1',
                      timestamp: '123456789',
                      type: 'text',
                      text: { body: 'I CONSENT' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    } as any;

    await processor.process(job);

    expect(prisma.lead.update).toHaveBeenCalledWith({
      where: { id: 'lead-1' },
      data: expect.objectContaining({
        mediaConsentGranted: true,
        mediaConsentSource: 'patient_message',
      }),
    });
  });

  it('should clear mediaUrls and set consent to false if user sends WITHDRAW CONSENT', async () => {
    (prisma.channel.findFirst as jest.Mock).mockResolvedValue({
      id: 'channel-1',
      organizationId: 'org-1',
      accessToken: 'token-123',
      organization: { id: 'org-1' },
    });
    (prisma.lead.findFirst as jest.Mock).mockResolvedValue({
      id: 'lead-1',
      mediaConsentGranted: true,
    });
    (prisma.conversation.findFirst as jest.Mock).mockResolvedValue({
      id: 'conv-1',
      leadId: 'lead-1',
      lead: { mediaConsentGranted: true },
    });
    (prisma.message.findUnique as jest.Mock).mockResolvedValue(null);

    const job = {
      data: {
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { display_phone_number: '123' },
                  messages: [
                    {
                      from: '456',
                      id: 'msg-withdraw-1',
                      timestamp: '123456789',
                      type: 'text',
                      text: { body: 'WITHDRAW CONSENT' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    } as any;

    await processor.process(job);

    expect(prisma.lead.update).toHaveBeenCalledWith({
      where: { id: 'lead-1' },
      data: expect.objectContaining({
        mediaConsentGranted: false,
        mediaConsentSource: 'patient_message',
      }),
    });

    expect(prisma.message.updateMany).toHaveBeenCalledWith({
      where: {
        conversation: { leadId: 'lead-1' },
        mediaUrl: { not: null },
      },
      data: {
        mediaUrl: null,
        mediaExpiresAt: null,
        content: '[Patient withdrew consent - Media deleted]',
      },
    });
  });

  let processor: WebhooksProcessor;
  let prisma: jest.Mocked<PrismaService>;
  let aiReplyQueue: any;

  beforeEach(async () => {
    // 1. Setup Mock Prisma
    const mockPrismaService = {
      channel: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      message: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'msg-1' }),
        updateMany: jest.fn(),
      },
      conversation: {
        findFirst: jest.fn(),
        create: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn().mockResolvedValue({ stateVersion: 2 }),
      },
      lead: {
        findFirst: jest.fn(),
        create: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      pipelineStage: {
        findFirst: jest.fn(),
      },
      outboxEvent: {
        create: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation(async (cb) => {
        return cb(mockPrismaService);
      }),
    };

    // 2. Setup Mock Queue
    const mockAiReplyQueue = {
      add: jest.fn(),
      getJob: jest.fn().mockResolvedValue(null),
    };

    // 3. Setup Mock gRPC Client
    const mockClientGrpc = {
      getService: jest.fn().mockReturnValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksProcessor,
        { provide: PrismaService, useValue: mockPrismaService },
        {
          provide: NotificationEmitterService,
          useValue: { emitNotification: jest.fn() },
        },
        { provide: WhatsappService, useValue: { sendTextMessage: jest.fn() } },
        {
          provide: WhatsappMediaService,
          useValue: { downloadMediaAsBase64: jest.fn() },
        },
        {
          provide: EventsGateway,
          useValue: {
            server: { to: jest.fn().mockReturnThis(), emit: jest.fn() },
            broadcastNewMessage: jest.fn(),
          },
        },
        {
          provide: FollowUpService,
          useValue: { cancelPendingFollowUps: jest.fn() },
        },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: CredentialsService, useValue: { readActive: jest.fn() } },
        { provide: 'AI_AGENT_PACKAGE', useValue: mockClientGrpc },
        { provide: getQueueToken('ai-reply'), useValue: mockAiReplyQueue },
        {
          provide: ActionExecutorService,
          useValue: { executeActions: jest.fn() },
        },
        {
          provide: PermissionService,
          useValue: { has: jest.fn().mockResolvedValue(true) },
        },
      ],
    }).compile();

    processor = module.get<WebhooksProcessor>(WebhooksProcessor);
    prisma = module.get(PrismaService);
    aiReplyQueue = module.get(getQueueToken('ai-reply'));

    // Simulate OnModuleInit
    processor.onModuleInit();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const createMockJob = (payload: any): Job => {
    return {
      id: 'job-123',
      data: payload,
    } as any as Job;
  };

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('should skip processing if payload has no messages (e.g. status updates)', async () => {
    const job = createMockJob({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'phone123' },
                statuses: [{ status: 'delivered' }], // no messages array
              },
            },
          ],
        },
      ],
    });

    await processor.process(job);
    expect(prisma.channel.findFirst).not.toHaveBeenCalled();
  });

  it('should drop message if organization is not found for the receiving phone number', async () => {
    prisma.channel.findFirst.mockResolvedValue(null as any);

    const job = createMockJob({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'unknown-phone' },
                messages: [
                  {
                    from: '123',
                    id: 'msg123',
                    type: 'text',
                    text: { body: 'Hi' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    await processor.process(job);
    expect(prisma.channel.findFirst).toHaveBeenCalled();
    expect(prisma.message.findFirst).not.toHaveBeenCalled();
  });

  it('should create lead and conversation if they do not exist', async () => {
    // 1. Channel exists with org
    prisma.channel.findFirst.mockResolvedValue({
      id: 'chan-1',
      organizationId: 'org-1',
      organization: { id: 'org-1' },
      providerAccountId: 'phone123',
    } as any);

    // 2. Message is not a duplicate
    prisma.message.findUnique.mockResolvedValue(null as any);

    // 3. Conversation doesn't exist yet
    prisma.conversation.findFirst.mockResolvedValue(null as any);

    // 4. Lead doesn't exist yet (in transaction)
    prisma.lead.findFirst.mockResolvedValue(null as any);

    // 5. Mock creations
    const newLead = { id: 'lead-1', organizationId: 'org-1' };
    prisma.lead.upsert.mockResolvedValue(newLead as any);

    const newConversation = {
      id: 'conv-1',
      leadId: 'lead-1',
      organizationId: 'org-1',
    };
    prisma.conversation.create.mockResolvedValue(newConversation as any);
    prisma.conversation.update.mockResolvedValue({
      ...newConversation,
      stateVersion: 1,
    } as any);

    const newMessage = { id: 'db-msg-1' };
    prisma.message.create.mockResolvedValue(newMessage as any);

    const job = createMockJob({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'phone123' },
                messages: [
                  {
                    from: '4915112345678',
                    id: 'meta-msg-123',
                    type: 'text',
                    text: { body: 'Hello there' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    await processor.process(job);

    expect(prisma.lead.upsert).toHaveBeenCalled(); // Should auto-create lead
    expect(prisma.conversation.create).toHaveBeenCalled(); // Should auto-create conversation
    expect(prisma.message.create).toHaveBeenCalled(); // Should save the user's message
    expect(prisma.outboxEvent.create).toHaveBeenCalledWith({
      data: {
        topic: 'generate-reply',
        organizationId: 'org-1',
        payload: {
          conversationId: 'conv-1',
          customerPhone: '4915112345678',
          messageId: 'db-msg-1',
          organizationId: 'org-1',
          stateVersion: 1,
        },
        status: 'PENDING',
      },
    });
  });

  it('should skip duplicate messages (idempotency check)', async () => {
    // 1. Channel exists
    prisma.channel.findFirst.mockResolvedValue({
      id: 'chan-1',
      organization: { id: 'org-1' },
    } as any);

    // 2. Message already exists in DB
    prisma.message.findUnique.mockResolvedValue({ id: 'existing-msg' } as any);

    // 3. Conversation exists
    prisma.conversation.findFirst.mockResolvedValue({
      id: 'conv-1',
      leadId: 'lead-1',
    } as any);

    const job = createMockJob({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'phone123' },
                messages: [
                  {
                    from: '4915112345678',
                    id: 'duplicate-msg-id',
                    type: 'text',
                    text: { body: 'Hello' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    await processor.process(job);

    expect(prisma.message.findUnique).toHaveBeenCalledWith({
      where: { metaMessageId: 'duplicate-msg-id' },
    });
    // Should stop right here
    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(prisma.outboxEvent.create).not.toHaveBeenCalled();
  });
});
