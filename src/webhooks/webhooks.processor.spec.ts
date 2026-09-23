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

describe('WebhooksProcessor', () => {
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
        create: jest.fn(),
      },
      conversation: {
        findFirst: jest.fn(),
        create: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      lead: {
        findFirst: jest.fn(),
        create: jest.fn(),
        upsert: jest.fn(),
      },
      pipelineStage: {
        findFirst: jest.fn(),
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
    expect(aiReplyQueue.add).toHaveBeenCalledWith(
      'generate-reply',
      {
        conversationId: 'conv-1',
        organizationId: 'org-1',
        customerPhone: '4915112345678',
        latestMetaMessageId: 'meta-msg-123',
        imageBase64: undefined,
        audioBase64: undefined,
      },
      expect.any(Object),
    );
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
    expect(aiReplyQueue.add).not.toHaveBeenCalled();
  });
});
