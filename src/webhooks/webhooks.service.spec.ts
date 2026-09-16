import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksService } from './webhooks.service';
import { getQueueToken } from '@nestjs/bullmq';

describe('WebhooksService', () => {
  let provider: WebhooksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: getQueueToken('whatsapp-messages'), useValue: { add: jest.fn(), getJob: jest.fn() } }
      ],
      controllers: []
    }).compile();

    provider = module.get<WebhooksService>(WebhooksService);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
});
