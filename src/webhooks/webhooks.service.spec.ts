import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksService } from './webhooks.service';
import { getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';

describe('WebhooksService', () => {
  let provider: WebhooksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        {
          provide: getQueueToken('whatsapp-messages'),
          useValue: { add: jest.fn(), getJob: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('app-secret') },
        },
      ],
      controllers: [],
    }).compile();

    provider = module.get<WebhooksService>(WebhooksService);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });

  it('uses a constant-time HMAC comparison over the raw body', () => {
    const raw = Buffer.from('{ "unchanged": true }');
    const signature =
      'sha256=' +
      require('crypto')
        .createHmac('sha256', 'app-secret')
        .update(raw)
        .digest('hex');
    expect(provider.isValidMetaSignature(raw, signature)).toBe(true);
    expect(provider.isValidMetaSignature(raw, 'sha256=bad')).toBe(false);
    expect(
      provider.isValidMetaSignature(
        Buffer.from('{"unchanged":true}'),
        signature,
      ),
    ).toBe(false);
  });
});
