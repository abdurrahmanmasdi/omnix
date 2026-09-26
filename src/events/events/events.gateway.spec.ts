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

  beforeEach(async () => {
    mockEmit = jest.fn();
    mockTo = jest.fn().mockReturnValue({ emit: mockEmit });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsGateway,
        { provide: JwtService, useValue: { verify: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        {
          provide: PermissionService,
          useValue: { has: jest.fn().mockResolvedValue(true) },
        },
        {
          provide: PrismaService,
          useValue: {
            organizationMembership: {
              findFirst: jest.fn().mockResolvedValue({ id: 'test' }),
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
              canReadAll: true,
              canReadPii: true,
              canReadMessages: true,
            },
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
        organizationId: 'org-1',
        userId: 'user-1',
        type: 'LEAD_HANDED_OFF',
        title: 'Title',
        body: 'Body',
        isRead: false,
        createdAt: new Date(),
        // Adversarial
        user: { password: 'pwd' },
        internalRoutingId: '12345',
      };

      gateway.broadcastNotification('user-1', maliciousNotification);

      const emittedDto = mockEmit.mock.calls[0][1];
      expect(emittedDto).not.toHaveProperty('user');
      expect(emittedDto).not.toHaveProperty('internalRoutingId');
    });
  });
});
