import { Test, TestingModule } from '@nestjs/testing';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';

describe('ConversationsController', () => {
  let provider: ConversationsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationsController,
        { provide: ConversationsService, useValue: { methodName: jest.fn() } }
      ],
      controllers: [ConversationsController]
    }).compile();

    provider = module.get<ConversationsController>(ConversationsController);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
});
