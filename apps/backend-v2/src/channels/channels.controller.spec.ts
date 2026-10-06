import { Test, TestingModule } from '@nestjs/testing';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { PermissionService } from '../auth/permission.service';
import { Reflector } from '@nestjs/core';

describe('ChannelsController', () => {
  let provider: ChannelsController;
  let service: ChannelsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChannelsController,
        {
          provide: ChannelsService,
          useValue: {
            createChannel: jest.fn(),
            getChannels: jest.fn(),
            deleteChannel: jest.fn(),
          },
        },
        { provide: PermissionService, useValue: { has: jest.fn() } },
        { provide: Reflector, useValue: { getAllAndOverride: jest.fn() } },
      ],
      controllers: [ChannelsController],
    }).compile();

    provider = module.get<ChannelsController>(ChannelsController);
    service = module.get<ChannelsService>(ChannelsService);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });

  it('should return channels for an organization', async () => {
    const mockUser = {
      id: 'user1',
      email: 'test@test.com',
      organizationId: 'org1',
    };
    const mockChannels = [{ id: 'chan1' }];
    jest.spyOn(service, 'getChannels').mockResolvedValue(mockChannels as any);

    const result = await provider.getChannels(mockUser as any);
    expect(result).toEqual(mockChannels);
    expect(service.getChannels).toHaveBeenCalledWith('org1');
  });
});
