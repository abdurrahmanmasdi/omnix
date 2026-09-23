import { Test, TestingModule } from '@nestjs/testing';
import { ConversationsService } from './conversations.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../webhooks/whatsapp.service';
import { EventsGateway } from '../events/events/events.gateway';

describe('ConversationsService', () => {
  let provider: ConversationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationsService,
        { provide: PrismaService, useValue: { methodName: jest.fn() } },
        { provide: WhatsappService, useValue: { methodName: jest.fn() } },
        { provide: EventsGateway, useValue: { methodName: jest.fn() } },
      ],
      controllers: [],
    }).compile();

    provider = module.get<ConversationsService>(ConversationsService);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
});
