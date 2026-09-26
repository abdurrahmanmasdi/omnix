import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksController } from './webhooks.controller';
import { ConfigService } from '@nestjs/config';
import { WebhooksService } from './webhooks.service';
import { PermissionService } from '../auth/permission.service';

describe('WebhooksController', () => {
  let provider: WebhooksController;
  let testingModule: TestingModule;

  beforeEach(async () => {
    testingModule = await Test.createTestingModule({
      providers: [
        WebhooksController,
        {
          provide: WebhooksService,
          useValue: {
            queueIncomingMessage: jest.fn(),
            isValidMetaSignature: jest.fn(),
          },
        },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        {
          provide: PermissionService,
          useValue: { has: jest.fn().mockResolvedValue(true) },
        },
      ],
      controllers: [WebhooksController],
    }).compile();

    provider = testingModule.get<WebhooksController>(WebhooksController);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });

  it('rejects an unsigned webhook before it can enqueue work', async () => {
    const service = testingModule.get(WebhooksService);
    (service.isValidMetaSignature as jest.Mock).mockReturnValue(false);
    await expect(
      provider.receiveMessage(
        { object: 'whatsapp_business_account', entry: [] },
        undefined,
        { rawBody: Buffer.from('{}') } as any,
      ),
    ).rejects.toThrow('Invalid Meta webhook signature');
    expect(service.queueIncomingMessage).not.toHaveBeenCalled();
  });

  it('queues only a signed WhatsApp payload', async () => {
    const service = testingModule.get(WebhooksService);
    (service.isValidMetaSignature as jest.Mock).mockReturnValue(true);
    const payload = { object: 'whatsapp_business_account', entry: [] } as any;
    await expect(
      provider.receiveMessage(payload, 'sha256=valid', {
        rawBody: Buffer.from('{}'),
      } as any),
    ).resolves.toBe('EVENT_RECEIVED');
    expect(service.queueIncomingMessage).toHaveBeenCalledWith(payload);
  });
});
