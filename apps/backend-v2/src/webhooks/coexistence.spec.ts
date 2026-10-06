import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhooksProcessor } from './webhooks.processor';
import { AiReplyProcessor } from './ai-reply.processor';
import { DeliveryAuthService } from './delivery-auth.service';
import { AGENT_CONTRACT_VERSION } from './contracts/agent-contract';
import { toInboxMessage } from '../conversations/conversation-response.mapper';
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
      channel: {
        findMany: jest.fn(async () => channels),
        findFirstOrThrow: jest.fn(async ({ where }) =>
          channels.find((c) => c.id === where.id),
        ),
        update: jest.fn(async ({ where, data }) =>
          Object.assign(
            channels.find((c) => c.id === where.id),
            data,
          ),
        ),
      },
      conversation: {
        findUnique: jest.fn(async ({ where }) =>
          conversations.find((c) => c.id === where.id),
        ),
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
        count: jest.fn(async () => messages.length + 1),
        findMany: jest.fn(async () => []),
        updateMany: jest.fn(),
        createMany: jest.fn(),
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
  const echoPayload = () => {
    const body: any = payload('smb_message_echoes');
    const value = body.entry[0].changes[0].value;
    delete value.history;
    value.message_echoes = [
      {
        id: 'wamid.synthetic.echo',
        from: '900',
        to: '200',
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: 'text',
        text: { body: 'Synthetic staff reply from phone' },
      },
    ];
    return body;
  };
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

  it('stores a duplicate phone echo once and atomically pauses/version-bumps a staff-initiated conversation without a lead', async () => {
    const body = echoPayload();
    expect((await deliver(body)).status).toBe(200);
    expect((await deliver(body)).status).toBe(200);
    expect(state.messages).toHaveLength(1);
    expect(state.conversations).toHaveLength(1);
    expect(state.conversations[0]).toMatchObject({
      aiPaused: true,
      stateVersion: 2,
    });
    expect(state.conversations[0].leadId).toBeUndefined();
    expect(state.messages[0]).toMatchObject({
      handledBy: 'HUMAN',
      type: 'USER_TEXT',
      status: 'SENT',
      metadata: { origin: 'WHATSAPP_PHONE' },
    });
    expect(toInboxMessage(state.messages[0]).origin).toBe('WHATSAPP_PHONE');
    expect(state.prisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(state.ai.generateReply).not.toHaveBeenCalled();
    expect(state.sends.sendBubble).not.toHaveBeenCalled();
    expect(state.notification.emit).not.toHaveBeenCalled();
    // All persistence calls run inside the one committed transaction.
    expect(state.prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(state.prisma.conversation.update).toHaveBeenCalledTimes(1);
  });
  it('stores an opted-out lead echo without changing consent and audits it', async () => {
    state.conversations.push({
      id: 'conv-stop',
      organizationId: 'org-a',
      externalContactId: '200',
      channelId: 'channel-a',
      aiPaused: false,
      stateVersion: 4,
      leadId: 'lead-stop',
      lead: { optedOutAt: new Date() },
    });
    const optedOutAt = state.conversations[0].lead.optedOutAt;
    await deliver(echoPayload());
    expect(state.conversations[0]).toMatchObject({
      aiPaused: true,
      stateVersion: 5,
      lead: { optedOutAt },
    });
    expect(state.prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({ patientOptedOut: true }),
        }),
      }),
    );
    expect(state.messages).toHaveLength(1);
  });
  it('a signed echo while AI generation is awaiting RPC drops the stale reply before actions or sends', async () => {
    state.conversations.push({
      id: 'conv-generating',
      organizationId: 'org-a',
      externalContactId: '200',
      channelId: 'channel-a',
      aiPaused: false,
      aiDisclosureSent: true,
      stateVersion: 7,
      lead: null,
    });
    let finishGeneration!: (response: any) => void;
    let signalStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      signalStarted = resolve;
    });
    const response = new Promise((resolve) => {
      finishGeneration = resolve;
    });
    const grpc = {
      generateReply: jest.fn(() => {
        signalStarted();
        return response;
      }),
    };
    const claims = {
      claim: jest.fn(async () => ({
        owner: 'synthetic-owner',
        organization: {
          id: 'org-a',
          name: 'Synthetic Clinic',
          aiPersona: null,
        },
        conversation: { ...state.conversations[0] },
        channel: null,
        messageIds: ['synthetic-inbound'],
      })),
      heartbeat: jest.fn(async () => true),
      owns: jest.fn(async () => true),
      finish: jest.fn(),
      releaseConversation: jest.fn(),
    };
    const actions = { executeActions: jest.fn() };
    const ai = new AiReplyProcessor(
      state.prisma as never,
      state.sends as never,
      state.events as never,
      actions as never,
      {} as never,
      {} as never,
      new DeliveryAuthService(state.prisma as never),
      claims as never,
      state.sends as never,
      grpc as never,
    );
    const work = ai.process({
      data: {
        organizationId: 'org-a',
        conversationId: 'conv-generating',
        newMessageIds: ['synthetic-inbound'],
      },
    } as never);
    await started;
    expect((await deliver(echoPayload())).status).toBe(200);
    expect(state.conversations[0]).toMatchObject({
      aiPaused: true,
      stateVersion: 8,
    });
    finishGeneration({
      replyText: 'Synthetic obsolete AI reply',
      actions: [],
      contractVersion: AGENT_CONTRACT_VERSION,
    });
    await work;
    expect(grpc.generateReply).toHaveBeenCalledTimes(1);
    expect(state.sends.sendBubble).not.toHaveBeenCalled();
    expect(state.sends.sendTextMessage).not.toHaveBeenCalled();
    expect(state.prisma.message.createMany).not.toHaveBeenCalled();
    expect(actions.executeActions).not.toHaveBeenCalled();
  });
  it('rejects unsigned echoes and drops ambiguous tenant routes', async () => {
    expect((await deliver(echoPayload(), false)).status).toBe(401);
    state.setChannels([
      { organization: { id: 'org-a' } },
      { organization: { id: 'org-b' } },
    ]);
    expect((await deliver(echoPayload())).status).toBe(200);
    expect(state.messages).toHaveLength(0);
  });
  it('reports history completion/decline and never sends or qualifies', async () => {
    const complete: any = payload();
    complete.entry[0].changes[0].value.history[0].metadata = {
      phase: 2,
      chunk_order: 1,
      progress: 100,
    };
    await deliver(complete);
    const declined: any = payload();
    declined.entry[0].changes[0].value.history = [
      { errors: [{ code: 2593109 }] },
    ];
    await deliver(declined);
    expect(state.prisma.channel.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({ historySyncState: 'COMPLETE' }),
        }),
      }),
    );
    expect(state.prisma.channel.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({ historySyncState: 'DECLINED' }),
        }),
      }),
    );
    expect(state.ai.generateReply).not.toHaveBeenCalled();
    expect(state.sends.sendBubble).not.toHaveBeenCalled();
  });
});
