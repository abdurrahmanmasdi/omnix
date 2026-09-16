import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksController } from './webhooks.controller';
import { ConfigService } from '@nestjs/config';
import { WebhooksService } from './webhooks.service';

describe('WebhooksController', () => {
  let provider: WebhooksController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksController,
        { provide: WebhooksService, useValue: { methodName: jest.fn() } },
        { provide: ConfigService, useValue: { methodName: jest.fn() } }
      ],
      controllers: [WebhooksController]
    }).compile();

    provider = module.get<WebhooksController>(WebhooksController);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
});
