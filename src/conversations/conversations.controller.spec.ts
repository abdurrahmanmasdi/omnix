import { Test, TestingModule } from '@nestjs/testing';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { PermissionService } from '../auth/permission.service';
import { Reflector } from '@nestjs/core';

describe('ConversationsController', () => {
  let provider: ConversationsController;
  let service: ConversationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationsController,
        {
          provide: ConversationsService,
          useValue: {
            getConversations: jest.fn(),
            getMessages: jest.fn(),
            sendManualMessage: jest.fn(),
            toggleAiState: jest.fn(),
          },
        },
        { provide: PermissionService, useValue: { has: jest.fn() } },
        { provide: Reflector, useValue: { getAllAndOverride: jest.fn() } },
      ],
      controllers: [ConversationsController],
    }).compile();

    provider = module.get<ConversationsController>(ConversationsController);
    service = module.get<ConversationsService>(ConversationsService);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });

  it('should return conversations for an organization', async () => {
    const mockUser = {
      id: 'user1',
      email: 'test@test.com',
      organizationId: 'org1',
    };
    const mockConversations = [{ id: 'conv1' }];
    jest
      .spyOn(service, 'getConversations')
      .mockResolvedValue(mockConversations as any);

    const result = await provider.getConversations(mockUser as any, {
      page: 1,
      limit: 20,
    });
    expect(result).toEqual(mockConversations);
    expect(service.getConversations).toHaveBeenCalledWith(
      'org1',
      'user1',
      1,
      20,
      undefined,
    );
  });
});
