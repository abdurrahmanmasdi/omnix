import { Test, TestingModule } from '@nestjs/testing';
import { ChannelsService } from './channels.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../webhooks/whatsapp.service';

describe('ChannelsService', () => {
  let provider: ChannelsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChannelsService,
        { provide: PrismaService, useValue: { methodName: jest.fn() } },
        { provide: WhatsappService, useValue: { methodName: jest.fn() } }
      ],
      controllers: []
    }).compile();

    provider = module.get<ChannelsService>(ChannelsService);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
});
