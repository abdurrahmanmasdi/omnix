/* eslint-disable @typescript-eslint/no-unsafe-argument -- Fake Nest providers and BullMQ jobs are intentional integration-test seams. */
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { PrismaService } from '../src/prisma/prisma.service';
import { InboundClaimService } from '../src/webhooks/inbound-claim.service';
import { OutboxProcessor } from '../src/core/outbox/outbox.processor';
import { DeliveryAuthService } from '../src/webhooks/delivery-auth.service';
import { WebhooksProcessor } from '../src/webhooks/webhooks.processor';
import { OutboundAttemptService } from '../src/webhooks/outbound-attempt.service';
import { FollowUpService } from '../src/follow-ups/follow-up.service';
import { FollowUpProcessor } from '../src/follow-ups/follow-up.processor';
import { AiReplyProcessor } from '../src/webhooks/ai-reply.processor';
import { of } from 'rxjs';
import { tenantStorage } from '../src/core/tenant/tenant.context';
import { safeDeploy } from '../src/credentials/deploy-cli';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { Logger, UnauthorizedException } from '@nestjs/common';
import request from 'supertest';
import { createHmac } from 'node:crypto';
import { WebhooksController } from '../src/webhooks/webhooks.controller';
import { WebhooksService } from '../src/webhooks/webhooks.service';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { ActionExecutorService } from '../src/webhooks/action-executor.service';
import { NotificationRelayProcessor } from '../src/core/outbox/notification-relay.processor';
import { PermissionService } from '../src/auth/permission.service';
import { AuditService } from '../src/audit/audit.service';

jest.setTimeout(120_000);
let admin: Client;
let dbName: string;
let prisma: PrismaService;
let claims: InboundClaimService;
const system = <T>(fn: () => Promise<T>) =>
  tenantStorage.run({ isSystemBypass: true }, async () => await fn());

beforeAll(async () => {
  const adminUrl = process.env.UPGRADE_TEST_ADMIN_URL;
  if (!adminUrl || new URL(adminUrl).hostname !== '127.0.0.1')
    throw new Error('ISOLATED_TEST_DATABASE_REQUIRED');
  admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  dbName = `omnidesk_s04_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE DATABASE "${dbName}"`);
  const url = new URL(adminUrl);
  url.pathname = `/${dbName}`;
  process.env.DATABASE_URL = url.toString();
  await safeDeploy(resolve(__dirname, '..'));
  prisma = new PrismaService();
  await prisma.$connect();
  claims = new InboundClaimService(prisma);
});

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
  if (admin) {
    if (dbName && /^omnidesk_s04_[a-f0-9]{32}$/.test(dbName))
      await admin.query(`DROP DATABASE "${dbName}" WITH (FORCE)`);
    await admin.end();
  }
});

async function fixture() {
  return system(async () => {
    const org = await prisma.organization.create({
      data: { name: 'Synthetic Clinic', slug: randomUUID() },
    });
    await prisma.aiPersona.create({
      data: { organizationId: org.id, clinicName: 'Synthetic Clinic' },
    });
    const credential = await prisma.credential.create({
      data: {
        organizationId: org.id,
        provider: 'WHATSAPP_CLOUD_API',
        encryptedPayload: 'synthetic-never-used',
      },
    });
    const channel = await prisma.channel.create({
      data: {
        organizationId: org.id,
        provider: 'WHATSAPP_CLOUD_API',
        providerAccountId: randomUUID(),
        credentialId: credential.id,
      },
    });
    const phone = `1555${Math.floor(Math.random() * 1_000_000_000)
      .toString()
      .padStart(9, '0')}`;
    const lead = await prisma.lead.create({
      data: {
        organizationId: org.id,
        firstName: 'Synthetic',
        lastName: 'Patient',
        phoneNumber: phone,
        country: 'US',
        timezone: 'UTC',
        primaryLanguage: 'en',
      },
    });
    const conv = await prisma.conversation.create({
      data: {
        organizationId: org.id,
        externalContactId: phone,
        leadId: lead.id,
        channelId: channel.id,
      },
    });
    const message = (type: 'LEAD_TEXT' | 'LEAD_MEDIA' = 'LEAD_TEXT') =>
      prisma.message.create({
        data: {
          conversationId: conv.id,
          metaMessageId: randomUUID(),
          content: type === 'LEAD_MEDIA' ? '[Image message]' : 'Hello',
          type,
          status: 'PENDING',
        },
      });
    let windowOpened = false;
    const bubble = async () => {
      if (!windowOpened) {
        await message();
        windowOpened = true;
      }
      return await prisma.message.create({
        data: {
          conversationId: conv.id,
          content: 'Synthetic reply',
          type: 'AI_TEXT',
          status: 'PENDING',
          idempotencyKey: randomUUID(),
        },
      });
    };
    return { org, channel, lead, conv, message, bubble };
  });
}

function webhook(
  prismaService: PrismaService,
  outboundAttempts: any = { reconcileStatus: jest.fn() },
) {
  return new WebhooksProcessor(
    prismaService,
    { send: jest.fn() } as any,
    {} as any,
    {} as any,
    { broadcastNewMessage: jest.fn() } as any,
    { cancelPendingFollowUps: jest.fn().mockResolvedValue(undefined) } as any,
    { record: jest.fn().mockResolvedValue(undefined) } as any,
    {
      readActive: jest.fn().mockResolvedValue({ accessToken: 'synthetic' }),
    } as any,
    outboundAttempts,
    { getService: jest.fn() } as any,
    { getJob: jest.fn().mockResolvedValue(null) } as any,
  );
}

it('keeps private values out of signed ingress, worker, AI, and provider-error logs', async () => {
  const f = await fixture();
  const patientText = 'S11_PATIENT_TEXT_40b7';
  const privateValues = [
    patientText,
    f.conv.externalContactId!,
    'S11_ACCESS_TOKEN_527e',
    'S11_CRM_TOKEN_b0fe',
    'S11_MEDIA_URL_d9ac',
  ];
  await system(() =>
    prisma.conversation.update({
      where: { id: f.conv.id },
      data: { aiDisclosureSent: true },
    }),
  );
  const secret = 'synthetic-s11-signing-secret';
  const inboundAdd = jest.fn().mockResolvedValue({ id: 'queued' });
  const module = await Test.createTestingModule({
    controllers: [WebhooksController, AuthController],
    providers: [
      WebhooksService,
      { provide: getQueueToken('whatsapp-messages'), useValue: { add: inboundAdd } },
      { provide: ConfigService, useValue: { get: () => secret } },
      { provide: AuthService, useValue: {
        login: jest.fn().mockRejectedValue(new UnauthorizedException('Invalid credentials')),
      } },
    ],
  }).compile();
  const app = module.createNestApplication({ rawBody: true });
  await app.init();
  const captured: string[] = [];
  const spies = (['log', 'warn', 'error'] as const).map((level) =>
    jest.spyOn(Logger.prototype, level).mockImplementation((...args: any[]) => {
      captured.push(args.map(String).join(' '));
    }),
  );
  try {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        id: randomUUID(),
        changes: [{ value: {
          metadata: { phone_number_id: f.channel.providerAccountId },
          messages: [{
            from: f.conv.externalContactId,
            id: randomUUID(),
            timestamp: String(Math.floor(Date.now() / 1000)),
            type: 'text',
            text: { body: patientText },
          }],
        } }],
      }],
    };
    const raw = JSON.stringify(payload);
    const signature = createHmac('sha256', secret).update(raw).digest('hex');
    await request(app.getHttpServer())
      .post('/webhooks/whatsapp')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', `sha256=${signature}`)
      .send(raw)
      .expect(200);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: `synthetic-${privateValues[3]}@example.invalid`, password: privateValues[2] })
      .expect(401);
    expect(inboundAdd).toHaveBeenCalledTimes(1);
    const inboundJob = inboundAdd.mock.calls[0];
    expect(inboundJob[2].jobId).toMatch(/^inbound-[a-f0-9]{64}$/);
    await webhook(prisma).process({ id: inboundJob[2].jobId, data: inboundJob[1] } as any);

    const aiAdd = jest.fn().mockResolvedValue({ id: 'reply' });
    await new OutboxProcessor(
      prisma,
      { add: jest.fn() } as any,
      { add: aiAdd } as any,
    ).processPendingEvents();
    expect(aiAdd).toHaveBeenCalledTimes(1);

    const providerError: any = new Error(privateValues.join(' '));
    providerError.response = { status: 429, data: privateValues.join(' ') };
    const sendTextMessage = jest.fn().mockRejectedValue(providerError);
    const outbound = new OutboundAttemptService(
      prisma,
      new DeliveryAuthService(prisma),
      { sendTextMessage } as any,
    );
    const generateReply = jest.fn().mockReturnValue(of({
      replyText: patientText,
      safetyFlag: false,
      confidenceScore: 1,
      actions: [],
    }));
    const processor = new AiReplyProcessor(
      prisma,
      { sendTypingIndicator: jest.fn() } as any,
      { broadcastNewMessage: jest.fn() } as any,
      { executeActions: jest.fn() } as any,
      { scheduleAutoFollowUps: jest.fn() } as any,
      { record: jest.fn() } as any,
      new DeliveryAuthService(prisma),
      claims,
      outbound,
      { getService: () => ({ generateReply }) } as any,
    );
    await expect(processor.process({ id: randomUUID(), data: aiAdd.mock.calls[0][1] } as any))
      .rejects.toThrow('OUTBOUND_UNRESOLVED');
    expect(generateReply).toHaveBeenCalledTimes(1);
    expect(sendTextMessage).toHaveBeenCalledTimes(1);
    const output = captured.join('\n');
    expect(output).toContain(inboundJob[2].jobId);
    expect(output).toContain('OUTBOUND_PROVIDER_RESULT_REJECTED');
    expect(privateValues.some((value) => output.includes(value))).toBe(false);
  } finally {
    spies.forEach((spy) => spy.mockRestore());
    await app.close();
  }
});

it('commits one handoff alert and retries its live relay after transport failure', async () => {
  const f = await fixture();
  const user = await system(async () => {
    const grants = await Promise.all(
      ['notifications:view', 'leads:read:all'].map((action) =>
        prisma.permission.upsert({ where: { action }, update: {}, create: { action } }),
      ),
    );
    const role = await prisma.role.create({
      data: { organizationId: f.org.id, name: 'Pilot staff', slug: randomUUID() },
    });
    await prisma.rolePermission.createMany({
      data: grants.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
    });
    const member = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.invalid`, password_hash: 'synthetic',
        firstName: 'Synthetic', lastName: 'Staff', status: 'ACTIVE',
      },
    });
    await prisma.organizationMembership.create({
      data: { organizationId: f.org.id, userId: member.id, roleId: role.id, status: 'ACTIVE' },
    });
    return member;
  });
  const gateway = {
    broadcastLeadUpdate: jest.fn(),
    broadcastConversationUpdate: jest.fn(),
    broadcastNotification: jest.fn()
      .mockRejectedValueOnce(new Error('synthetic transport outage'))
      .mockResolvedValue(undefined),
  };
  const executor = new ActionExecutorService(
    prisma,
    {} as any,
    gateway as any,
    {} as any,
    {} as any,
    new AuditService(prisma),
  );
  const action = [{ type: 'HANDOFF_TO_HUMAN', payload: '{}' }];
  const first = await system(() => executor.executeActions(f.org.id, f.conv.id, action));
  expect(first).toMatchObject({ executed: 1, rejected: 0, failed: 0 });
  const duplicate = await system(() => executor.executeActions(f.org.id, f.conv.id, action));
  expect(duplicate).toMatchObject({ executed: 1, rejected: 0, failed: 0 });
  const notifications = await system(() => prisma.notification.findMany({
    where: { organizationId: f.org.id, type: 'LEAD_HANDED_OFF' },
  }));
  expect(notifications).toHaveLength(1);
  const outbox = await system(() => prisma.outboxEvent.findMany({
    where: { organizationId: f.org.id, topic: 'notification.broadcast' },
  }));
  expect(outbox).toHaveLength(1);
  expect(outbox[0].status).toBe('PENDING');
  expect(gateway.broadcastNotification).not.toHaveBeenCalled();

  const relayAdd = jest.fn()
    .mockRejectedValueOnce(new Error('synthetic Redis outage'))
    .mockResolvedValue({ id: 'queued' });
  const outboxProcessor = new OutboxProcessor(
    prisma, { add: relayAdd } as any, { add: jest.fn() } as any,
  );
  await outboxProcessor.processPendingEvents();
  expect((await system(() => prisma.outboxEvent.findUniqueOrThrow({ where: { id: outbox[0].id } }))).status).toBe('PENDING');
  await outboxProcessor.processPendingEvents();
  expect(relayAdd).toHaveBeenCalledTimes(2);
  expect(relayAdd.mock.calls[1][2].jobId).toBe(`outbox-${outbox[0].id}`);

  const relay = new NotificationRelayProcessor(
    prisma, new PermissionService(prisma), gateway as any,
  );
  const job = { name: 'notification.broadcast', data: relayAdd.mock.calls[1][1] } as any;
  await expect(relay.process(job)).rejects.toThrow('NOTIFICATION_RELAY_RETRY');
  await relay.process(job);
  expect(gateway.broadcastNotification).toHaveBeenCalledTimes(2);

  await system(() => prisma.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } }));
  await relay.process(job);
  expect(gateway.broadcastNotification).toHaveBeenCalledTimes(2);
  expect(await system(() => prisma.notification.count({ where: { organizationId: f.org.id } }))).toBe(1);
});

it('does not commit a handoff when no staff member is eligible', async () => {
  const f = await fixture();
  const executor = new ActionExecutorService(
    prisma, {} as any,
    { broadcastLeadUpdate: jest.fn(), broadcastConversationUpdate: jest.fn() } as any,
    {} as any, {} as any, new AuditService(prisma),
  );
  const result = await system(() => executor.executeActions(f.org.id, f.conv.id, [
    { type: 'HANDOFF_TO_HUMAN', payload: '{}' },
  ]));
  expect(result).toMatchObject({
    executed: 0, rejected: 0, failed: 1,
    outcomes: [{ reasonCode: 'NO_ELIGIBLE_STAFF', retryable: true }],
  });
  const conversation = await system(() => prisma.conversation.findUniqueOrThrow({ where: { id: f.conv.id } }));
  expect(conversation.aiPaused).toBe(false);
  expect(await system(() => prisma.notification.count({ where: { organizationId: f.org.id } }))).toBe(0);
  expect(await system(() => prisma.outboxEvent.count({ where: { organizationId: f.org.id, topic: 'notification.broadcast' } }))).toBe(0);
});

it('keeps an unresponsive-lead staff alert pending until an eligible recipient exists', async () => {
  const f = await fixture();
  const followUp = await system(() => prisma.scheduledFollowUp.create({
    data: {
      organizationId: f.org.id, conversationId: f.conv.id,
      type: 'AUTO_NO_REPLY', attempt: 2, scheduledAt: new Date(Date.now() - 1000),
    },
  }));
  const worker = new FollowUpProcessor(
    prisma, {} as any, {} as any, {} as any, {} as any,
    new DeliveryAuthService(prisma), {} as any, {} as any,
  );
  const job = { data: { followUpId: followUp.id } } as any;
  await expect(worker.process(job)).rejects.toThrow('NO_ELIGIBLE_STAFF');
  expect((await system(() => prisma.scheduledFollowUp.findUniqueOrThrow({ where: { id: followUp.id } }))).status).toBe('PENDING');
  expect(await system(() => prisma.notification.count({ where: { organizationId: f.org.id } }))).toBe(0);

  await system(async () => {
    const grants = await Promise.all(['notifications:view', 'leads:read:all'].map((action) =>
      prisma.permission.upsert({ where: { action }, update: {}, create: { action } }),
    ));
    const role = await prisma.role.create({ data: { organizationId: f.org.id, name: 'Pilot staff', slug: randomUUID() } });
    await prisma.rolePermission.createMany({ data: grants.map((permission) => ({ roleId: role.id, permissionId: permission.id })) });
    const user = await prisma.user.create({ data: {
      email: `${randomUUID()}@example.invalid`, password_hash: 'synthetic',
      firstName: 'Staff', lastName: 'Member', status: 'ACTIVE',
    } });
    await prisma.organizationMembership.create({
      data: { organizationId: f.org.id, userId: user.id, roleId: role.id, status: 'ACTIVE' },
    });
  });
  await worker.process(job);
  await worker.process(job);
  expect((await system(() => prisma.scheduledFollowUp.findUniqueOrThrow({ where: { id: followUp.id } }))).status).toBe('SENT');
  expect(await system(() => prisma.notification.count({ where: { organizationId: f.org.id } }))).toBe(1);
  expect(await system(() => prisma.outboxEvent.count({ where: { organizationId: f.org.id, topic: 'notification.broadcast' } }))).toBe(1);
});

it('sends only a neutral bubble and retries failed AI and follow-up handoffs without resending', async () => {
  const f = await fixture();
  await system(() => prisma.conversation.update({
    where: { id: f.conv.id }, data: { aiDisclosureSent: true },
  }));
  const inbound = await system(() => f.message());
  const actionExecutor = {
    executeActions: jest.fn()
      .mockResolvedValueOnce({ executed: 0, rejected: 1, failed: 0, outcomes: [
        { status: 'REJECTED', retryable: false, reasonCode: 'ACTION_INVALID' },
      ] })
      .mockResolvedValueOnce({ executed: 0, rejected: 0, failed: 1, outcomes: [
        { status: 'FAILED', retryable: true, reasonCode: 'NO_ELIGIBLE_STAFF' },
      ] })
      .mockResolvedValueOnce({ executed: 1, rejected: 0, failed: 0, outcomes: [
        { status: 'EXECUTED', retryable: false, reasonCode: 'OK' },
      ] }),
  };
  const sendTextMessage = jest.fn().mockImplementation(async () => ({ messages: [{ id: randomUUID() }] }));
  const outbound = new OutboundAttemptService(
    prisma, new DeliveryAuthService(prisma), { sendTextMessage } as any,
  );
  const generateReply = jest.fn().mockReturnValue(of({
    replyText: 'Our staff has been alerted.',
    actions: [{ type: 'UPDATE_LEAD', payload: '{bad' }],
  }));
  const ai = new AiReplyProcessor(
    prisma,
    { sendTypingIndicator: jest.fn() } as any,
    { broadcastNewMessage: jest.fn() } as any,
    actionExecutor as any,
    { scheduleAutoFollowUps: jest.fn() } as any,
    { record: jest.fn() } as any,
    new DeliveryAuthService(prisma),
    claims,
    outbound,
    { getService: () => ({ generateReply }) } as any,
  );
  const aiJob = {
    id: randomUUID(),
    data: {
      organizationId: f.org.id,
      conversationId: f.conv.id,
      newMessageIds: [inbound.id],
    },
  } as any;
  await expect(ai.process(aiJob)).rejects.toThrow('ACTION_FALLBACK_HANDOFF_FAILED');
  expect(sendTextMessage).toHaveBeenCalledTimes(1);
  const neutralAi = await system(() => prisma.message.findMany({
    where: { conversationId: f.conv.id, type: 'AI_TEXT' },
  }));
  expect(neutralAi).toHaveLength(1);
  expect(neutralAi[0].content).not.toContain('alerted');
  await ai.process(aiJob);
  expect(sendTextMessage).toHaveBeenCalledTimes(1);

  const followUp = await system(() => prisma.scheduledFollowUp.create({
    data: {
      organizationId: f.org.id,
      conversationId: f.conv.id,
      type: 'AI_SCHEDULED',
      scheduledAt: new Date(Date.now() - 1000),
    },
  }));
  actionExecutor.executeActions
    .mockResolvedValueOnce({ executed: 0, rejected: 1, failed: 0, outcomes: [
      { status: 'REJECTED', retryable: false, reasonCode: 'ACTION_INVALID' },
    ] })
    .mockResolvedValueOnce({ executed: 0, rejected: 0, failed: 1, outcomes: [
      { status: 'FAILED', retryable: true, reasonCode: 'NO_ELIGIBLE_STAFF' },
    ] })
    .mockResolvedValueOnce({ executed: 1, rejected: 0, failed: 0, outcomes: [
      { status: 'EXECUTED', retryable: false, reasonCode: 'OK' },
    ] });
  const followUpWorker = new FollowUpProcessor(
    prisma,
    {} as any,
    { broadcastNewMessage: jest.fn() } as any,
    actionExecutor as any,
    { send: jest.fn() } as any,
    new DeliveryAuthService(prisma),
    outbound,
    { getService: () => ({ generateReply }) } as any,
  );
  const followUpJob = { data: { followUpId: followUp.id } } as any;
  await expect(followUpWorker.process(followUpJob))
    .rejects.toThrow('ACTION_FALLBACK_HANDOFF_FAILED');
  expect(sendTextMessage).toHaveBeenCalledTimes(2);
  await followUpWorker.process(followUpJob);
  expect(sendTextMessage).toHaveBeenCalledTimes(2);
});

it('rejects an incompatible AI contract version before actions or patient delivery', async () => {
  const f = await fixture();
  const inbound = await system(() => f.message());
  const executeActions = jest.fn();
  const sendBubble = jest.fn();
  const ai = new AiReplyProcessor(
    prisma,
    { sendTypingIndicator: jest.fn() } as any,
    { broadcastNewMessage: jest.fn() } as any,
    { executeActions } as any,
    { scheduleAutoFollowUps: jest.fn() } as any,
    { record: jest.fn() } as any,
    new DeliveryAuthService(prisma), claims,
    { sendBubble } as any,
    { getService: () => ({ generateReply: () => of({
      contractVersion: 2,
      replyText: 'We changed your record and alerted staff.',
      actions: [{ type: 'UPDATE_LEAD', payload: '{"status":"QUALIFIED"}' }],
    }) }) } as any,
  );
  await expect(ai.process({ id: randomUUID(), data: {
    organizationId: f.org.id, conversationId: f.conv.id, newMessageIds: [inbound.id],
  } } as any)).rejects.toThrow('AI_CONTRACT_VERSION_UNSUPPORTED');
  expect(executeActions).not.toHaveBeenCalled();
  expect(sendBubble).not.toHaveBeenCalled();
  expect(await system(() => prisma.message.count({ where: { conversationId: f.conv.id, type: 'AI_TEXT' } }))).toBe(0);
});

it('persists one message and outbox event per unique webhook, including rapid arrivals', async () => {
  const f = await fixture();
  const worker = webhook(prisma);
  const scheduled = await system(() =>
    prisma.scheduledFollowUp.create({
      data: {
        organizationId: f.org.id,
        conversationId: f.conv.id,
        type: 'AUTO_NO_REPLY',
        scheduledAt: new Date(Date.now() + 60_000),
      },
    }),
  );
  const messages = [
    {
      from: f.conv.externalContactId,
      id: randomUUID(),
      type: 'text',
      text: { body: 'First' },
    },
    {
      from: f.conv.externalContactId,
      id: randomUUID(),
      type: 'text',
      text: { body: 'Second' },
    },
  ];
  const job = {
    id: randomUUID(),
    data: {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: f.channel.providerAccountId },
                messages,
              },
            },
          ],
        },
      ],
    },
  } as any;
  await worker.process(job);
  await worker.process(job); // Meta redelivery
  const saved = await system(() =>
    prisma.message.findMany({
      where: { conversationId: f.conv.id, type: 'LEAD_TEXT' },
    }),
  );
  expect(saved).toHaveLength(2);
  expect(saved.every((message) => message.status === 'PENDING')).toBe(true);
  const events = await system(() =>
    prisma.outboxEvent.findMany({
      where: { organizationId: f.org.id, topic: 'generate-reply' },
    }),
  );
  expect(events).toHaveLength(2);
  expect(
    new Set(events.map((event) => (event.payload as any).messageId)),
  ).toEqual(new Set(saved.map((message) => message.id)));
  expect(
    (
      await system(() =>
        prisma.conversation.findUniqueOrThrow({
          where: { id: f.conv.id },
        }),
      )
    ).stateVersion,
  ).toBe(f.conv.stateVersion + 2);
  expect(
    (
      await system(() =>
        prisma.scheduledFollowUp.findUniqueOrThrow({
          where: { id: scheduled.id },
        }),
      )
    ).status,
  ).toBe('CANCELLED');
  await system(() =>
    prisma.outboxEvent.deleteMany({
      where: { organizationId: f.org.id },
    }),
  );
});

it('drops an ambiguous provider account instead of routing across tenants', async () => {
  const first = await fixture();
  const second = await fixture();
  await system(() =>
    prisma.channel.update({
      where: { id: second.channel.id },
      data: { providerAccountId: first.channel.providerAccountId },
    }),
  );
  await webhook(prisma).process({
    id: randomUUID(),
    data: {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: first.channel.providerAccountId },
                messages: [
                  {
                    from: first.conv.externalContactId,
                    id: randomUUID(),
                    type: 'text',
                    text: { body: 'Synthetic inbound' },
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  } as any);
  expect(
    await system(() =>
      prisma.message.count({
        where: { conversationId: first.conv.id },
      }),
    ),
  ).toBe(0);
  expect(
    await system(() =>
      prisma.message.count({
        where: { conversationId: second.conv.id },
      }),
    ),
  ).toBe(0);
});

it('claims a duplicate job only once and finishes only owned rows', async () => {
  const f = await fixture();
  const inbound = await system(() => f.message());
  const first = await system(() =>
    claims.claim(f.org.id, f.conv.id, [inbound.id]),
  );
  expect(first?.messageIds).toEqual([inbound.id]);
  expect(
    await system(() => claims.claim(f.org.id, f.conv.id, [inbound.id])),
  ).toBeNull();
  await system(() =>
    claims.finish(f.conv.id, 'wrong-owner', [inbound.id], 'PROCESSED'),
  );
  expect(
    (
      await system(() =>
        prisma.message.findUniqueOrThrow({ where: { id: inbound.id } }),
      )
    ).status,
  ).toBe('PROCESSING');
  await system(() =>
    claims.finish(f.conv.id, first!.owner, [inbound.id], 'PROCESSED'),
  );
  await system(() => claims.releaseConversation(f.conv.id, first!.owner));
  expect(
    await system(() => claims.claim(f.org.id, f.conv.id, [inbound.id])),
  ).toBeNull();
});

it('does not let a cross-tenant job terminalize a pending inbound row', async () => {
  const owner = await fixture();
  const other = await fixture();
  const inbound = await system(() => owner.message());
  expect(
    await system(() => claims.claim(other.org.id, owner.conv.id, [inbound.id])),
  ).toBeNull();
  expect(
    (
      await system(() =>
        prisma.message.findUniqueOrThrow({ where: { id: inbound.id } }),
      )
    ).status,
  ).toBe('PENDING');
});

it('holds one conversation lease while a second text or media message arrives', async () => {
  const f = await fixture();
  const first = await system(() => f.message());
  const owner = await system(() =>
    claims.claim(f.org.id, f.conv.id, [first.id]),
  );
  const second = await system(() => f.message('LEAD_MEDIA'));
  expect(
    await system(() => claims.claim(f.org.id, f.conv.id, [second.id])),
  ).toBeNull();
  expect(
    (
      await system(() =>
        prisma.message.findUniqueOrThrow({ where: { id: second.id } }),
      )
    ).status,
  ).toBe('PENDING');
  await system(() =>
    claims.finish(f.conv.id, owner!.owner, [first.id], 'PROCESSED'),
  );
  await system(() => claims.releaseConversation(f.conv.id, owner!.owner));
  const next = await system(() =>
    claims.claim(f.org.id, f.conv.id, [second.id]),
  );
  expect(next?.messageIds).toEqual([second.id]);
  await system(() =>
    claims.finish(f.conv.id, next!.owner, [second.id], 'PROCESSED'),
  );
  await system(() => claims.releaseConversation(f.conv.id, next!.owner));
});

it('folds two pending messages into one claim even when only one outbox ID dispatches', async () => {
  const f = await fixture();
  const first = await system(() => f.message());
  const second = await system(() => f.message('LEAD_MEDIA'));
  const claim = await system(() =>
    claims.claim(f.org.id, f.conv.id, [second.id]),
  );
  expect(claim?.messageIds).toHaveLength(2);
  expect(claim?.messageIds).toEqual(expect.arrayContaining([first.id, second.id]));
  await system(() =>
    claims.finish(f.conv.id, claim!.owner, claim!.messageIds, 'PROCESSED'),
  );
  await system(() => claims.releaseConversation(f.conv.id, claim!.owner));
});

it('rejects an older generation after a new inbound changes conversation version', async () => {
  const f = await fixture();
  const auth = new DeliveryAuthService(prisma);
  const previousVersion = f.conv.stateVersion;
  await system(() =>
    prisma.conversation.update({
      where: { id: f.conv.id },
      data: { stateVersion: { increment: 1 } },
    }),
  );
  expect(
    await system(() =>
      auth.authorizeDelivery(f.org.id, f.conv.id, previousVersion),
    ),
  ).toBe(false);
  expect(
    await system(() =>
      auth.authorizeDelivery(f.org.id, f.conv.id, previousVersion + 1),
    ),
  ).toBe(true);
});

it('cancels stale generated bubbles after a crash and newer inbound', async () => {
  const f = await fixture();
  const inbound = await system(() => f.message());
  const staleBubble = await system(() =>
    prisma.message.create({
      data: {
        conversationId: f.conv.id,
        type: 'AI_TEXT',
        content: 'Outdated reply',
        status: 'PENDING',
        idempotencyKey: `ai-${inbound.id}-bubble-0`,
        metadata: { generationVersion: f.conv.stateVersion },
      },
    }),
  );
  const updated = await system(() =>
    prisma.conversation.update({
      where: { id: f.conv.id },
      data: { stateVersion: { increment: 1 } },
    }),
  );
  const sendBubble = jest.fn();
  const processor = new AiReplyProcessor(
    prisma,
    { sendTextMessage: jest.fn() } as any,
    { broadcastNewMessage: jest.fn() } as any,
    { executeActions: jest.fn() } as any,
    { scheduleAutoFollowUps: jest.fn() } as any,
    { record: jest.fn() } as any,
    new DeliveryAuthService(prisma),
    claims,
    { sendBubble } as any,
    { getService: () => ({ generateReply: jest.fn() }) } as any,
  );
  await processor.process({
    id: randomUUID(),
    data: {
      organizationId: f.org.id,
      conversationId: f.conv.id,
      customerPhone: f.conv.externalContactId,
      newMessageIds: [inbound.id],
      stateVersion: updated.stateVersion,
    },
  } as any);
  expect(sendBubble).not.toHaveBeenCalled();
  expect(
    (
      await system(() =>
        prisma.message.findUniqueOrThrow({ where: { id: staleBubble.id } }),
      )
    ).status,
  ).toBe('CANCELLED');
  expect(
    (
      await system(() =>
        prisma.message.findUniqueOrThrow({ where: { id: inbound.id } }),
      )
    ).status,
  ).toBe('PROCESSED');
});

it.each(['paused', 'opted-out', 'disabled-channel'])(
  'terminalizes ineligible pending inbound for %s',
  async (reason) => {
    const f = await fixture();
    const inbound = await system(() => f.message());
    if (reason === 'paused')
      await system(() =>
        prisma.conversation.update({
          where: { id: f.conv.id },
          data: { aiPaused: true },
        }),
      );
    if (reason === 'opted-out')
      await system(() =>
        prisma.lead.update({
          where: { id: f.lead.id },
          data: { optedOutAt: new Date() },
        }),
      );
    if (reason === 'disabled-channel')
      await system(() =>
        prisma.channel.update({
          where: { id: f.channel.id },
          data: { status: 'DISCONNECTED' },
        }),
      );
    expect(
      await system(() => claims.claim(f.org.id, f.conv.id, [inbound.id])),
    ).toBeNull();
    expect(
      (
        await system(() =>
          prisma.message.findUniqueOrThrow({ where: { id: inbound.id } }),
        )
      ).status,
    ).toBe('PROCESSED');
  },
);

it('recovers an expired claim but does not steal a live lease', async () => {
  const f = await fixture();
  const inbound = await system(() => f.message());
  const owner = await system(() =>
    claims.claim(f.org.id, f.conv.id, [inbound.id]),
  );
  await claims.recoverInbound();
  expect(
    (
      await system(() =>
        prisma.message.findUniqueOrThrow({ where: { id: inbound.id } }),
      )
    ).status,
  ).toBe('PROCESSING');
  const past = new Date(Date.now() - 61_000);
  await system(() =>
    prisma.conversation.update({
      where: { id: f.conv.id },
      data: { generationLeaseUntil: past },
    }),
  );
  await system(() =>
    prisma.message.update({
      where: { id: inbound.id },
      data: { processingLeaseUntil: past, createdAt: past },
    }),
  );
  await claims.recoverInbound();
  const recovered = await system(() =>
    prisma.message.findUniqueOrThrow({ where: { id: inbound.id } }),
  );
  expect(recovered.status).toBe('PENDING');
  expect(recovered.processingOwner).toBeNull();
  expect(
    await system(() =>
      prisma.outboxEvent.count({
        where: { topic: 'generate-reply', organizationId: f.org.id },
      }),
    ),
  ).toBe(1);
  const retry = await system(() =>
    claims.claim(f.org.id, f.conv.id, [inbound.id]),
  );
  expect(retry?.owner).not.toBe(owner?.owner);
  await system(() =>
    claims.finish(f.conv.id, retry!.owner, [inbound.id], 'PROCESSED'),
  );
  await system(() => claims.releaseConversation(f.conv.id, retry!.owner));
  await system(() =>
    prisma.outboxEvent.deleteMany({
      where: { organizationId: f.org.id },
    }),
  );
});

it('retries outbox relay interruption without losing the inbound job', async () => {
  const f = await fixture();
  const inbound = await system(() => f.message());
  const event = await system(() =>
    prisma.outboxEvent.create({
      data: {
        organizationId: f.org.id,
        topic: 'generate-reply',
        payload: {
          organizationId: f.org.id,
          conversationId: f.conv.id,
          messageId: inbound.id,
          stateVersion: f.conv.stateVersion,
        },
      },
    }),
  );
  const add = jest
    .fn()
    .mockRejectedValueOnce(new Error('synthetic relay outage'))
    .mockResolvedValueOnce({ id: 'queued' });
  const processor = new OutboxProcessor(
    prisma,
    { add: jest.fn() } as any,
    { add } as any,
  );
  await processor.processPendingEvents();
  expect(
    (
      await system(() =>
        prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } }),
      )
    ).status,
  ).toBe('PENDING');
  await processor.processPendingEvents();
  expect(add).toHaveBeenCalledTimes(2);
  expect(add.mock.calls[1][1].newMessageIds).toEqual([inbound.id]);
  expect(
    (
      await system(() =>
        prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } }),
      )
    ).status,
  ).toBe('PROCESSED');
});

it('persists accepted outbound intent and never resends a duplicate job', async () => {
  const f = await fixture();
  const bubble = await system(() => f.bubble());
  const sendTextMessage = jest
    .fn()
    .mockResolvedValue({ messages: [{ id: randomUUID() }] });
  const attempts = new OutboundAttemptService(
    prisma,
    new DeliveryAuthService(prisma),
    { sendTextMessage } as any,
  );
  expect(
    await system(() =>
      attempts.sendBubble(f.org.id, f.conv.id, bubble, f.conv.stateVersion),
    ),
  ).toBe('ACCEPTED');
  expect(
    await system(() =>
      attempts.sendBubble(f.org.id, f.conv.id, bubble, f.conv.stateVersion),
    ),
  ).toBe('ACCEPTED');
  expect(sendTextMessage).toHaveBeenCalledTimes(1);
  const attempt = await system(() =>
    prisma.outboundAttempt.findUniqueOrThrow({
      where: { messageId: bubble.id },
    }),
  );
  expect(attempt.status).toBe('ACCEPTED');
  expect(
    (
      await system(() =>
        prisma.message.findUniqueOrThrow({ where: { id: bubble.id } }),
      )
    ).status,
  ).toBe('SENT');
});

it('holds ambiguous acceptance for callback reconciliation without a resend', async () => {
  const f = await fixture();
  const bubble = await system(() => f.bubble());
  const sendTextMessage = jest
    .fn()
    .mockRejectedValue(new Error('synthetic timeout after acceptance'));
  const attempts = new OutboundAttemptService(
    prisma,
    new DeliveryAuthService(prisma),
    { sendTextMessage } as any,
  );
  expect(
    await system(() =>
      attempts.sendBubble(f.org.id, f.conv.id, bubble, f.conv.stateVersion),
    ),
  ).toBe('WAITING');
  expect(
    await system(() =>
      attempts.sendBubble(f.org.id, f.conv.id, bubble, f.conv.stateVersion),
    ),
  ).toBe('WAITING');
  expect(sendTextMessage).toHaveBeenCalledTimes(1);
  const providerId = randomUUID();
  await webhook(prisma, attempts).process({
    id: randomUUID(),
    data: {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: f.channel.providerAccountId },
                statuses: [
                  {
                    id: providerId,
                    status: 'sent',
                    biz_opaque_callback_data: bubble.idempotencyKey,
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  } as any);
  expect(
    await system(() =>
      attempts.sendBubble(f.org.id, f.conv.id, bubble, f.conv.stateVersion),
    ),
  ).toBe('ACCEPTED');
  expect(sendTextMessage).toHaveBeenCalledTimes(1);
});

it('marks an accepted send UNKNOWN after a local commit failure and resumes from callback', async () => {
  const f = await fixture();
  const bubble = await system(() => f.bubble());
  const providerId = randomUUID();
  const sendTextMessage = jest
    .fn()
    .mockResolvedValue({ messages: [{ id: providerId }] });
  let failCommit = true;
  const database = new Proxy(prisma, {
    get(target, key) {
      if (key === '$transaction')
        return (...args: any[]) => {
          if (failCommit) {
            failCommit = false;
            throw new Error('synthetic database outage after Meta acceptance');
          }
          return (target.$transaction as any)(...args);
        };
      return (target as any)[key];
    },
  });
  const attempts = new OutboundAttemptService(
    database,
    new DeliveryAuthService(prisma),
    { sendTextMessage } as any,
  );
  await expect(
    system(() =>
      attempts.sendBubble(f.org.id, f.conv.id, bubble, f.conv.stateVersion),
    ),
  ).rejects.toThrow('synthetic database outage');
  expect(
    (
      await system(() =>
        prisma.outboundAttempt.findUniqueOrThrow({
          where: { messageId: bubble.id },
        }),
      )
    ).status,
  ).toBe('SENDING');
  expect(
    await system(() =>
      attempts.sendBubble(f.org.id, f.conv.id, bubble, f.conv.stateVersion),
    ),
  ).toBe('WAITING');
  expect(sendTextMessage).toHaveBeenCalledTimes(1);
  await system(() =>
    prisma.outboundAttempt.update({
      where: { messageId: bubble.id },
      data: { startedAt: new Date(Date.now() - 180_000) },
    }),
  );
  await attempts.markInterruptedSendsUnknown();
  expect(
    (
      await system(() =>
        prisma.outboundAttempt.findUniqueOrThrow({
          where: { messageId: bubble.id },
        }),
      )
    ).status,
  ).toBe('UNKNOWN');
  await system(() =>
    attempts.reconcileStatus(
      f.org.id,
      providerId,
      'delivered',
      bubble.idempotencyKey!,
    ),
  );
  expect(
    (
      await system(() =>
        prisma.outboundAttempt.findUniqueOrThrow({
          where: { messageId: bubble.id },
        }),
      )
    ).status,
  ).toBe('ACCEPTED');
});

it('resumes only unsent bubbles after a partial provider result', async () => {
  const f = await fixture();
  const first = await system(() => f.bubble());
  const second = await system(() => f.bubble());
  const sendTextMessage = jest
    .fn()
    .mockResolvedValueOnce({ messages: [{ id: randomUUID() }] })
    .mockRejectedValueOnce(new Error('synthetic timeout'));
  const attempts = new OutboundAttemptService(
    prisma,
    new DeliveryAuthService(prisma),
    { sendTextMessage } as any,
  );
  expect(
    await system(() =>
      attempts.sendBubble(f.org.id, f.conv.id, first, f.conv.stateVersion),
    ),
  ).toBe('ACCEPTED');
  expect(
    await system(() =>
      attempts.sendBubble(f.org.id, f.conv.id, second, f.conv.stateVersion),
    ),
  ).toBe('WAITING');
  expect(
    await system(() =>
      attempts.sendBubble(f.org.id, f.conv.id, first, f.conv.stateVersion),
    ),
  ).toBe('ACCEPTED');
  expect(
    await system(() =>
      attempts.sendBubble(f.org.id, f.conv.id, second, f.conv.stateVersion),
    ),
  ).toBe('WAITING');
  expect(sendTextMessage).toHaveBeenCalledTimes(2);
  await system(() =>
    attempts.reconcileStatus(
      f.org.id,
      randomUUID(),
      'sent',
      second.idempotencyKey!,
    ),
  );
  expect(
    await system(() =>
      attempts.sendBubble(f.org.id, f.conv.id, second, f.conv.stateVersion),
    ),
  ).toBe('ACCEPTED');
  expect(sendTextMessage).toHaveBeenCalledTimes(2);
});

it('retries a confirmed provider rejection but cancels a paused send before I/O', async () => {
  const f = await fixture();
  const bubble = await system(() => f.bubble());
  const sendTextMessage = jest
    .fn()
    .mockRejectedValueOnce({ response: { status: 429 } })
    .mockResolvedValueOnce({ messages: [{ id: randomUUID() }] });
  const attempts = new OutboundAttemptService(
    prisma,
    new DeliveryAuthService(prisma),
    { sendTextMessage } as any,
  );
  expect(
    await system(() =>
      attempts.sendBubble(f.org.id, f.conv.id, bubble, f.conv.stateVersion),
    ),
  ).toBe('WAITING');
  expect(
    await system(() =>
      attempts.sendBubble(f.org.id, f.conv.id, bubble, f.conv.stateVersion),
    ),
  ).toBe('ACCEPTED');
  const pausedBubble = await system(() => f.bubble());
  await system(() =>
    prisma.conversation.update({
      where: { id: f.conv.id },
      data: { aiPaused: true, stateVersion: { increment: 1 } },
    }),
  );
  expect(
    await system(() =>
      attempts.sendBubble(
        f.org.id,
        f.conv.id,
        pausedBubble,
        f.conv.stateVersion,
      ),
    ),
  ).toBe('CANCELLED');
  expect(sendTextMessage).toHaveBeenCalledTimes(2);
});

it('recovers a confirmed failed provider status with bounded retry context', async () => {
  const f = await fixture();
  const bubble = await system(() => f.bubble());
  const sendTextMessage = jest
    .fn()
    .mockRejectedValueOnce({ response: { status: 429 } })
    .mockResolvedValueOnce({ messages: [{ id: randomUUID() }] });
  const attempts = new OutboundAttemptService(
    prisma,
    new DeliveryAuthService(prisma),
    { sendTextMessage } as any,
  );
  expect(
    await system(() =>
      attempts.sendBubble(f.org.id, f.conv.id, bubble, f.conv.stateVersion),
    ),
  ).toBe('WAITING');
  await system(() =>
    prisma.outboundAttempt.update({
      where: { messageId: bubble.id },
      data: { updatedAt: new Date(Date.now() - 120_000) },
    }),
  );
  await attempts.retryConfirmedFailures();
  expect(sendTextMessage).toHaveBeenCalledTimes(2);
  expect(
    (
      await system(() =>
        prisma.outboundAttempt.findUniqueOrThrow({
          where: { messageId: bubble.id },
        }),
      )
    ).status,
  ).toBe('ACCEPTED');
});

it('enforces the WhatsApp follow-up window and recovers a lost scheduled job', async () => {
  const f = await fixture();
  const bubble = await system(() => f.bubble());
  await system(() =>
    prisma.message.updateMany({
      where: { conversationId: f.conv.id, type: 'LEAD_TEXT' },
      data: { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    }),
  );
  const sendTextMessage = jest
    .fn()
    .mockResolvedValue({ messages: [{ id: randomUUID() }] });
  const attempts = new OutboundAttemptService(
    prisma,
    new DeliveryAuthService(prisma),
    { sendTextMessage } as any,
  );
  expect(
    await system(() =>
      attempts.sendBubble(
        f.org.id,
        f.conv.id,
        bubble,
        f.conv.stateVersion,
        'follow-up',
      ),
    ),
  ).toBe('CANCELLED');
  expect(sendTextMessage).not.toHaveBeenCalled();
  // There is no approved template sender in the pilot. The safe path is a
  // persisted cancellation with an explicit template requirement.
  const outsideWindow = await system(() =>
    prisma.outboundAttempt.findUniqueOrThrow({ where: { messageId: bubble.id } }),
  );
  expect(outsideWindow.status).toBe('CANCELLED');
  const due = await system(() =>
    prisma.scheduledFollowUp.create({
      data: {
        organizationId: f.org.id,
        conversationId: f.conv.id,
        type: 'AUTO_NO_REPLY',
        scheduledAt: new Date(Date.now() - 600_000),
      },
    }),
  );
  const add = jest
    .fn()
    .mockRejectedValueOnce(new Error('synthetic queue outage'))
    .mockResolvedValueOnce({ id: 'recovered-job' });
  const followUps = new FollowUpService(prisma, { add } as any);
  await followUps.recoverDueFollowUps();
  expect(
    (
      await system(() =>
        prisma.scheduledFollowUp.findUniqueOrThrow({ where: { id: due.id } }),
      )
    ).recoveryQueuedAt,
  ).toBeNull();
  await followUps.recoverDueFollowUps();
  expect(add).toHaveBeenCalledTimes(2);
  expect(add.mock.calls[1][1]).toEqual({ followUpId: due.id });
  expect(
    (
      await system(() =>
        prisma.scheduledFollowUp.findUniqueOrThrow({ where: { id: due.id } }),
      )
    ).recoveryQueuedAt,
  ).not.toBeNull();
});

it('retries a confirmed follow-up rejection without repeating an accepted bubble', async () => {
  const f = await fixture();
  await system(() => f.message()); // Opens the customer-service window.
  const followUp = await system(() =>
    prisma.scheduledFollowUp.create({
      data: {
        organizationId: f.org.id,
        conversationId: f.conv.id,
        type: 'AI_SCHEDULED',
        scheduledAt: new Date(Date.now() - 1000),
      },
    }),
  );
  const sendTextMessage = jest
    .fn()
    .mockRejectedValueOnce({ response: { status: 429 } })
    .mockResolvedValueOnce({ messages: [{ id: randomUUID() }] });
  const outbound = new OutboundAttemptService(
    prisma,
    new DeliveryAuthService(prisma),
    { sendTextMessage } as any,
  );
  const generateReply = jest
    .fn()
    .mockReturnValue(of({ replyText: 'Synthetic follow-up', actions: [] }));
  const processor = new FollowUpProcessor(
    prisma,
    {} as any,
    { broadcastNewMessage: jest.fn() } as any,
    { executeActions: jest.fn() } as any,
    { send: jest.fn() } as any,
    new DeliveryAuthService(prisma),
    outbound,
    { getService: () => ({ generateReply }) } as any,
  );
  const job = { data: { followUpId: followUp.id } } as any;
  await expect(processor.process(job)).rejects.toThrow('OUTBOUND_UNRESOLVED');
  expect(
    (
      await system(() =>
        prisma.scheduledFollowUp.findUniqueOrThrow({
          where: { id: followUp.id },
        }),
      )
    ).status,
  ).toBe('PENDING');
  await processor.process(job);
  expect(generateReply).toHaveBeenCalledTimes(1);
  expect(sendTextMessage).toHaveBeenCalledTimes(2);
  expect(
    (
      await system(() =>
        prisma.scheduledFollowUp.findUniqueOrThrow({
          where: { id: followUp.id },
        }),
      )
    ).status,
  ).toBe('SENT');
});
