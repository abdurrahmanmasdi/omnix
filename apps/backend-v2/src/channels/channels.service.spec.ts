import { Test, TestingModule } from '@nestjs/testing';
import { ChannelsService } from './channels.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../webhooks/whatsapp.service';
import { InstagramService } from '../webhooks/instagram.service';
import { CredentialsService } from '../credentials/credentials.service';
import { PermissionService } from '../auth/permission.service';

describe('ChannelsService', () => {
  let provider: ChannelsService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChannelsService,
        {
          provide: PrismaService,
          useValue: {
            channel: { findMany: jest.fn() },
          },
        },
        {
          provide: WhatsappService,
          useValue: { verifyCredentials: jest.fn(), disconnect: jest.fn() },
        },
        {
          provide: InstagramService,
          useValue: { verifyCredentials: jest.fn(), disconnect: jest.fn() },
        },
        {
          provide: CredentialsService,
          useValue: { create: jest.fn(), revoke: jest.fn() },
        },
        {
          provide:
            require('../modules/integration/crm/adapters/hubspot.adapter')
              .HubspotAdapter,
          useValue: {},
        },
        {
          provide: PermissionService,
          useValue: { has: jest.fn().mockResolvedValue(true) },
        },
      ],
      controllers: [],
    }).compile();

    provider = module.get<ChannelsService>(ChannelsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });

  it('should return channels for an organization', async () => {
    const mockChannels = [
      {
        id: 'chan1',
        provider: 'WHATSAPP_CLOUD_API',
        providerAccountId: 'acc1',
        status: 'ACTIVE',
        credentialId: 'cred1',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    jest
      .spyOn(prisma.channel, 'findMany')
      .mockResolvedValue(mockChannels as any);

    const result = await provider.getChannels('org1');
    expect(result).toEqual(mockChannels);
    expect(prisma.channel.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org1' },
      select: {
        id: true,
        provider: true,
        providerAccountId: true,
        status: true,
        credentialId: true,
        metadata: true,
        credential: { select: { status: true, lastVerifiedAt: true } },
        createdAt: true,
        updatedAt: true,
      },
    });
  });
});
