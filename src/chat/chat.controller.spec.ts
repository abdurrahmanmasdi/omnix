import { Test, TestingModule } from '@nestjs/testing';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

describe('ChatController', () => {
  let controller: ChatController;

  const mockChatService = {
    getConversationMessages: jest.fn(),
    getUserConversations: jest.fn(),
    createConversation: jest.fn(),
    createGroupConversation: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        {
          provide: ChatService,
          useValue: mockChatService,
        },
      ],
    }).compile();

    controller = module.get<ChatController>(ChatController);
  });

  it('passes cursor and limit to service when provided', async () => {
    const req = { user: { id: 'user-1' } } as never;
    const mockedMessages = [{ id: 'msg-1' }];
    mockChatService.getConversationMessages.mockResolvedValueOnce(
      mockedMessages,
    );

    const result = await controller.getConversationMessages(
      req,
      'conv-1',
      'msg-cursor-1',
      20,
    );

    expect(mockChatService.getConversationMessages).toHaveBeenCalledWith(
      'conv-1',
      'user-1',
      'msg-cursor-1',
      20,
    );
    expect(result).toEqual({ status: 'success', data: mockedMessages });
  });

  it('passes undefined cursor/limit when not provided', async () => {
    const req = { user: { id: 'user-1' } } as never;
    mockChatService.getConversationMessages.mockResolvedValueOnce([]);

    await controller.getConversationMessages(
      req,
      'conv-1',
      undefined,
      undefined,
    );

    expect(mockChatService.getConversationMessages).toHaveBeenCalledWith(
      'conv-1',
      'user-1',
      undefined,
      undefined,
    );
  });
});
