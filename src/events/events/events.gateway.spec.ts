import { Test, TestingModule } from '@nestjs/testing';
import { EventsGateway } from './events.gateway';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PermissionService } from '../../auth/permission.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('EventsGateway', () => {
  let gateway: EventsGateway;
  let mockEmit: jest.Mock;
  let mockTo: jest.Mock;
  let mockMembershipFind: jest.Mock;
  let mockPermissionHas: jest.Mock;
  let mockDisconnect: jest.Mock;

  beforeEach(async () => {
    mockEmit = jest.fn();
    mockTo = jest.fn().mockReturnValue({ emit: mockEmit });
    mockMembershipFind = jest.fn().mockResolvedValue({ id: 'test' });
    mockPermissionHas = jest.fn().mockResolvedValue(true);
    mockDisconnect = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsGateway,
        { provide: JwtService, useValue: { verify: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        {
          provide: PermissionService,
          useValue: { has: mockPermissionHas },
        },
        {
          provide: PrismaService,
          useValue: {
            user: {
              findFirst: jest.fn().mockResolvedValue({ id: 'test-user' }),
            },
            organizationMembership: {
              findFirst: mockMembershipFind,
            },
            conversation: {
              findUnique: jest
                .fn()
                .mockResolvedValue({ lead: { assignedAgentId: null } }),
            },
          },
        },
      ],
    }).compile();

    gateway = module.get<EventsGateway>(EventsGateway);
    // Mock the WebSocket server
    gateway.server = {
      to: mockTo,
      disconnectSockets: jest.fn(),
      in: jest.fn().mockReturnValue({
        fetchSockets: jest.fn().mockResolvedValue([
          {
            emit: mockEmit,
            data: {
              userId: 'test-user',
              organizationId: 'org-456',
              roleId: 'role-1',
              tokenExp: Math.floor(Date.now() / 1000) + 3600,
              canReadAll: true,
              canReadPii: true,
              canReadMessages: true,
            },
            disconnect: mockDisconnect,
          },
        ]),
        disconnectSockets: jest.fn(),
      }),
      use: jest.fn(),
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
    gateway.onModuleDestroy();
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  it('disconnects a revoked membership before emitting a patient event', async () => {
    mockMembershipFind.mockResolvedValue(null);
    await gateway.broadcastNewMessage('org-456', {
      id: 'msg-1',
      conversationId: 'conv-1',
      content: 'Private patient text',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(mockDisconnect).toHaveBeenCalledWith(true);
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('rechecks message-content permission at emission time', async () => {
    mockPermissionHas.mockImplementation(
      async (_userId: string, _organizationId: string, action: string) =>
        action !== 'leads:read:messages',
    );
    await gateway.broadcastNewMessage('org-456', {
      id: 'msg-1',
      conversationId: 'conv-1',
      content: 'Private patient text',
      mediaUrl: 'https://example.invalid/private-media',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(mockEmit).toHaveBeenCalledWith(
      'onNewMessage',
      expect.objectContaining({
        content: '[Message content hidden]',
        mediaUrl: '[Media hidden]',
      }),
    );
  });

  it('redacts live PII after its grant is revoked', async () => {
    mockPermissionHas.mockImplementation(
      async (_userId: string, _organizationId: string, action: string) =>
        action !== 'leads:read:pii',
    );
    await gateway.broadcastConversationUpdate('org-456', {
      id: 'conv-1',
      organizationId: 'org-456',
      externalContactId: '+15551234567',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(mockEmit).toHaveBeenCalledWith(
      'onConversationUpdate',
      expect.objectContaining({ externalContactId: null }),
    );
  });

  it('does not send notification content across organization rooms', async () => {
    await gateway.broadcastNotification('test-user', {
      id: 'notification-other-org',
      organizationId: 'org-other',
      title: 'Private patient',
      body: 'Private detail',
    });
    expect(mockEmit).not.toHaveBeenCalled();
  });

  describe('Adversarial DTO Mapping', () => {
    it('strips organization relations and tokens from lead broadcasts', async () => {
      const maliciousLead = {
        id: 'lead-123',
        organizationId: 'org-456',
        firstName: 'John',
        lastName: 'Doe',
        phoneNumber: '+1234567890',
        country: 'US',
        timezone: 'UTC',
        primaryLanguage: 'en',
        status: 'NEW',
        priority: 'HOT',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        // Adversarial injected payload
        organization: {
          id: 'org-456',
          hubspotToken: 'SECRET_HUBSPOT_TOKEN_XYZ', // Should be stripped
          stripeKey: 'sk_test_123', // Should be stripped
        },
        passwordHash: 'bcrypt_hash_here', // Should be stripped
        socialLinks: { secretNote: 'hide this' }, // Not in DTO
      };

      await gateway.broadcastLeadUpdate('org-456', maliciousLead);

      expect(mockEmit).toHaveBeenCalledWith('onLeadUpdate', expect.any(Object));

      const emittedDto = mockEmit.mock.calls[0][1];

      // Ensure safe fields exist
      expect(emittedDto.id).toBe('lead-123');
      expect(emittedDto.firstName).toBe('John');
      expect(emittedDto.createdAt).toBe('2026-01-01T00:00:00.000Z');

      // Ensure dangerous fields DO NOT exist
      expect(emittedDto).not.toHaveProperty('organization');
      expect(emittedDto).not.toHaveProperty('passwordHash');
      expect(emittedDto).not.toHaveProperty('socialLinks');

      // Ensure the object spread wasn't used by checking Object.keys
      const allowedKeys = [
        'id',
        'organizationId',
        'assignedAgentId',
        'firstName',
        'lastName',
        'email',
        'phoneNumber',
        'country',
        'timezone',
        'primaryLanguage',
        'status',
        'priority',
        'summary',
        'createdAt',
        'updatedAt',
      ];
      expect(
        Object.keys(emittedDto).every((key) => allowedKeys.includes(key)),
      ).toBe(true);
    });

    it('strips metadata and relations from message broadcasts', async () => {
      const maliciousMessage = {
        id: 'msg-1',
        conversationId: 'conv-1',
        content: 'Hello',
        type: 'USER_TEXT',
        handledBy: 'AI',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        // Adversarial
        metadata: { openaiKey: 'sk-123' },
        sender: { passwordHash: 'secret' },
        conversation: { internalStatus: 'foo' },
      };

      await gateway.broadcastNewMessage('org-456', maliciousMessage);

      const emittedDto = mockEmit.mock.calls[0][1];
      expect(emittedDto).not.toHaveProperty('metadata');
      expect(emittedDto).not.toHaveProperty('sender');
      expect(emittedDto).not.toHaveProperty('conversation');
    });

    it('strips unnecessary relations from conversation broadcasts', async () => {
      const maliciousConversation = {
        id: 'conv-1',
        organizationId: 'org-456',
        status: 'ACTIVE',
        aiPaused: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        // Adversarial
        organization: { adminEmail: 'admin@org.com' },
        messages: [{ content: 'secret content' }],
      };

      await gateway.broadcastConversationUpdate(
        'org-456',
        maliciousConversation,
      );

      const emittedDto = mockEmit.mock.calls[0][1];
      expect(emittedDto).not.toHaveProperty('organization');
      expect(emittedDto).not.toHaveProperty('messages');
    });

    it('strips internal fields from notification broadcasts', async () => {
      const maliciousNotification = {
        id: 'notif-1',
        organizationId: 'org-456',
        userId: 'test-user',
        type: 'LEAD_HANDED_OFF',
        title: 'Title',
        body: 'Body',
        isRead: false,
        createdAt: new Date(),
        // Adversarial
        user: { password: 'pwd' },
        internalRoutingId: '12345',
      };

      await gateway.broadcastNotification('test-user', maliciousNotification);

      const emittedDto = mockEmit.mock.calls[0][1];
      expect(emittedDto).not.toHaveProperty('user');
      expect(emittedDto).not.toHaveProperty('internalRoutingId');
    });
  });
});
