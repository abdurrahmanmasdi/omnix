import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhooksProcessor } from './webhooks.processor';
import { CoexistenceService } from './coexistence.service';

// Synthetic signed HTTP ingress -> real worker. No external assets contacted.
describe('signed coexistence webhooks', () => {
  let app: INestApplication;
  let state: ReturnType<typeof fixture>;
  function fixture() {
    const messages: any[] = [];
    const conversations: any[] = [];
    let channels: any[] = [
      {
        id: 'channel-a',
        organizationId: 'org-a',
        providerAccountId: '100',
        status: 'ACTIVE',
        metadata: { wabaId: 'waba-a' },
        organization: { id: 'org-a' },
      },
    ];
    const prisma = {
      channel: { findMany: jest.fn(async () => channels) },
      conversation: {
        findFirst: jest.fn(
          async ({ where }) =>
            conversations.find(
              (c) =>
                c.organizationId === where.organizationId &&
                c.externalContactId === where.externalContactId,
            ) ?? null,
        ),
        create: jest.fn(async ({ data }) => {
          const c = {
            id: `conv-${conversations.length}`,
            stateVersion: 1,
            ...data,
          };
          conversations.push(c);
          return c;
        }),
        update: jest.fn(async ({ where, data }) => {
          const c = conversations.find((c) => c.id === where.id);
          Object.assign(c, {
            ...data,
            stateVersion: c.stateVersion + (data.stateVersion?.increment ?? 0),
          });
          return c;
        }),
      },
      message: {
        findUnique: jest.fn(
          async ({ where }) =>
            messages.find((m) => m.metaMessageId === where.metaMessageId) ??
            null,
        ),
        create: jest.fn(async ({ data }) => {
          const m = {
            id: `msg-${messages.length}`,
            updatedAt: new Date(),
            ...data,
          };
          messages.push(m);
          return m;
        }),
      },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn(async (callback) => callback(prisma)),
    };
    const events = {
      broadcastNewMessage: jest.fn(),
      broadcastConversationUpdate: jest.fn(),
    };
    const ai = { generateReply: jest.fn() };
    const sends = { sendBubble: jest.fn(), sendTextMessage: jest.fn() };
    const notification = { emit: jest.fn() };
    const coexistence = new CoexistenceService(
      prisma as never,
      events as never,
    );
    const worker = new WebhooksProcessor(
      prisma as never,
      notification as never,
      sends as never,
      {} as never,
      events as never,
      {} as never,
      {} as never,
      {} as never,
      sends as never,
      ai as never,
      coexistence,
    );
    return {
      prisma,
      worker,
      coexistence,
      events,
      ai,
      sends,
      notification,
      messages,
      conversations,
      setChannels: (next: any[]) => {
        channels = next;
      },
    };
  }
  const payload = (field = 'history') => ({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-a',
        changes: [
          {
            field,
            value: {
              messaging_product: 'whatsapp',
              metadata: { phone_number_id: '100', display_phone_number: '900' },
              history: [
                {
                  threads: [
                    {
                      id: '200',
                      messages: [
                        {
                          id: 'wamid.synthetic.history',
                          from: '200',
                          timestamp: String(Math.floor(Date.now() / 1000)),
                          type: 'text',
                          text: { body: 'Synthetic historical enquiry' },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    ],
  });
  async function deliver(body: any, signed = true) {
    const raw = JSON.stringify(body);
    const signature =
      'sha256=' +
      createHmac('sha256', 'synthetic-app-secret').update(raw).digest('hex');
    return request(app.getHttpServer())
      .post('/webhooks/whatsapp')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', signed ? signature : 'sha256=invalid')
      .send(raw);
  }
  beforeEach(async () => {
    state = fixture();
    const config = {
      get: (key: string) =>
        key === 'META_APP_SECRET' ? 'synthetic-app-secret' : undefined,
    };
    const queue = {
      add: jest.fn(async (_name, data) =>
        state.worker.process({ id: 'synthetic-job', data } as never),
      ),
    };
    const module = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        { provide: ConfigService, useValue: config },
        {
          provide: WebhooksService,
          useValue: new WebhooksService(queue as never, config as never),
        },
      ],
    }).compile();
    app = module.createNestApplication({ rawBody: true, logger: false });
    await app.init();
  });
  afterEach(async () => {
    await app.close();
  });
  it('rejects unsigned history before persistence', async () => {
    expect((await deliver(payload(), false)).status).toBe(401);
    expect(state.prisma.$transaction).not.toHaveBeenCalled();
  });
  it('imports read-only history once without qualification, AI job or send', async () => {
    const body = payload();
    expect((await deliver(body)).status).toBe(200);
    expect((await deliver(body)).status).toBe(200);
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toMatchObject({
      handledBy: 'HUMAN',
      status: 'PROCESSED',
      metadata: { origin: 'WHATSAPP_HISTORY', readOnly: true },
    });
    expect(state.conversations[0]).toMatchObject({
      organizationId: 'org-a',
      channelId: 'channel-a',
      aiPaused: true,
    });
    expect(state.conversations[0].leadId).toBeUndefined();
    expect(state.ai.generateReply).not.toHaveBeenCalled();
    expect(state.sends.sendBubble).not.toHaveBeenCalled();
    expect(state.notification.emit).not.toHaveBeenCalled();
  });
  it('drops missing, ambiguous and wrong-WABA routes', async () => {
    for (const channels of [
      [],
      [{ organization: { id: 'org-a' } }, { organization: { id: 'org-b' } }],
      [
        {
          id: 'a',
          organizationId: 'org-a',
          status: 'ACTIVE',
          organization: { id: 'org-a' },
          metadata: { wabaId: 'other-waba' },
        },
      ],
    ]) {
      state.setChannels(channels);
      expect((await deliver(payload())).status).toBe(200);
    }
    expect(state.messages).toHaveLength(0);
  });
  it('stores only in the resolved tenant and excludes out-of-window history', async () => {
    state.setChannels([
      {
        id: 'channel-b',
        organizationId: 'org-b',
        status: 'ACTIVE',
        organization: { id: 'org-b' },
        metadata: { wabaId: 'waba-a' },
      },
    ]);
    expect((await deliver(payload())).status).toBe(200);
    expect(state.conversations[0].organizationId).toBe('org-b');
    const old = payload();
    const message =
      old.entry[0].changes[0].value.history[0].threads[0].messages[0];
    message.id = 'wamid.synthetic.old';
    message.timestamp = String(Math.floor(Date.now() / 1000) - 181 * 86400);
    await deliver(old);
    expect(state.messages).toHaveLength(1);
  });
});
