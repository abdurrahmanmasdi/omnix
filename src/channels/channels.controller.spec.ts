import { Test, TestingModule } from '@nestjs/testing';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';

describe('ChannelsController', () => {
  let provider: ChannelsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChannelsController,
        { provide: ChannelsService, useValue: { methodName: jest.fn() } }
      ],
      controllers: [ChannelsController]
    }).compile();

    provider = module.get<ChannelsController>(ChannelsController);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
});
