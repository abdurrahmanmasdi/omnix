import { Test, TestingModule } from '@nestjs/testing';
import { ConversationsService } from './conversations.service';
import { PrismaService } from '../prisma/prisma.service';
import { OutboundAttemptService } from '../webhooks/outbound-attempt.service';
import { EventsGateway } from '../events/events/events.gateway';
import { PermissionService } from '../auth/permission.service';

describe('ConversationsService', () => {
  let provider: ConversationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationsService,
        { provide: PrismaService, useValue: { methodName: jest.fn() } },
        {
          provide: OutboundAttemptService,
          useValue: { methodName: jest.fn() },
        },
        { provide: EventsGateway, useValue: { methodName: jest.fn() } },
        {
          provide: PermissionService,
          useValue: { has: jest.fn().mockResolvedValue(true) },
        },
      ],
      controllers: [],
    }).compile();

    provider = module.get<ConversationsService>(ConversationsService);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
});
