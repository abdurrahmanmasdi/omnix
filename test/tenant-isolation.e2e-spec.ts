import { ThrottlerModule } from '@nestjs/throttler';
/* eslint-disable @typescript-eslint/no-unsafe-argument -- Synthetic Nest providers. */
import { Client } from 'pg';
import { randomUUID, createHmac } from 'node:crypto';
import { resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getQueueToken } from '@nestjs/bullmq';
import request from 'supertest';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthModule } from '../src/auth/auth.module';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../src/auth/guards/permissions.guard';
import { ConversationsController } from '../src/conversations/conversations.controller';
import { ConversationsService } from '../src/conversations/conversations.service';
import { LeadsController } from '../src/leads/leads.controller';
import { LeadsService } from '../src/leads/leads.service';
import { QueryBuilderService } from '../src/common/query/query-builder.service';
import { NotificationEmitterService } from '../src/notifications/notification-emitter.service';
import { WhatsappService } from '../src/webhooks/whatsapp.service';
import { EventsGateway } from '../src/events/events/events.gateway';
import { WebhooksController } from '../src/webhooks/webhooks.controller';
import { WebhooksService } from '../src/webhooks/webhooks.service';
import { TenantMiddleware } from '../src/core/tenant/tenant.middleware';
import { tenantStorage } from '../src/core/tenant/tenant.context';
import { safeDeploy } from '../src/credentials/deploy-cli';

jest.setTimeout(120_000);
const accessSecret = 'synthetic-s06-access-secret';
const webhookSecret = 'synthetic-s06-meta-secret';
const system = <T>(fn: () => Promise<T>) =>
  tenantStorage.run({ isSystemBypass: true }, async () => await fn());
let admin: Client;
let dbName: string;
let app: INestApplication;
let prisma: PrismaService;
const providerSend = jest.fn();
const queueAdd = jest.fn().mockResolvedValue({ id: 'synthetic-webhook-job' });

async function seedTenant(permissionIds: string[]) {
  return system(async () => {
    const organization = await prisma.organization.create({
      data: { name: 'Synthetic Clinic', slug: randomUUID() },
    });
    const role = await prisma.role.create({
      data: {
        organizationId: organization.id,
        name: 'Manager',
        slug: 'manager',
      },
    });
    await prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({
        roleId: role.id,
        permissionId,
      })),
    });
    const user = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.invalid`,
        password_hash: 'synthetic',
        firstName: 'Synthetic',
        lastName: 'Staff',
        status: 'ACTIVE',
      },
    });
    await prisma.organizationMembership.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        roleId: role.id,
        status: 'ACTIVE',
      },
    });
    const lead = await prisma.lead.create({
      data: {
        organizationId: organization.id,
        phoneNumber: '15550000000',
        firstName: 'Synthetic',
        lastName: 'Contact',
        country: 'US',
        timezone: 'UTC',
        primaryLanguage: 'en',
      },
    });
    const conversation = await prisma.conversation.create({
      data: {
        organizationId: organization.id,
        leadId: lead.id,
        externalContactId: lead.phoneNumber,
      },
    });
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        content: 'Synthetic private text',
        type: 'LEAD_TEXT',
      },
    });
    const token = new JwtService().sign(
      {
        sub: user.id,
        email: user.email,
        organizationId: organization.id,
        roleId: role.id,
      },
      { secret: accessSecret, expiresIn: '15m' },
    );
    return { organization, role, user, lead, conversation, message, token };
  });
}

let first: Awaited<ReturnType<typeof seedTenant>>;
let second: Awaited<ReturnType<typeof seedTenant>>;

beforeAll(async () => {
  const adminUrl = process.env.UPGRADE_TEST_ADMIN_URL;
  if (!adminUrl || new URL(adminUrl).hostname !== '127.0.0.1')
    throw new Error('ISOLATED_TEST_DATABASE_REQUIRED');
  admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  dbName = `omnidesk_s06_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE DATABASE "${dbName}"`);
  const url = new URL(adminUrl);
  url.pathname = `/${dbName}`;
  process.env.DATABASE_URL = url.toString();
  process.env.JWT_ACCESS_SECRET = accessSecret;
  process.env.JWT_REFRESH_SECRET = 'synthetic-s06-refresh-secret';
  process.env.JWT_ACCESS_EXPIRATION = '15m';
  process.env.JWT_REFRESH_EXPIRATION = '7d';
  process.env.META_APP_SECRET = webhookSecret;
  await safeDeploy(resolve(__dirname, '..'));
  const module = await Test.createTestingModule({
    imports: [
      ThrottlerModule.forRoot([{ name: 'auth', ttl: 300000, limit: 10 }]),
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      PrismaModule,
      AuthModule,
    ],
    controllers: [ConversationsController, LeadsController, WebhooksController],
    providers: [
      ConversationsService,
      LeadsService,
      QueryBuilderService,
      NotificationEmitterService,
      WebhooksService,
      JwtAuthGuard,
      PermissionsGuard,
      { provide: WhatsappService, useValue: { sendTextMessage: providerSend } },
      {
        provide: EventsGateway,
        useValue: {
          broadcastNewMessage: jest.fn(),
          broadcastLeadUpdate: jest.fn().mockResolvedValue(undefined),
          broadcastNotification: jest.fn().mockResolvedValue(undefined),
        },
      },
      {
        provide: getQueueToken('whatsapp-messages'),
        useValue: { add: queueAdd },
      },
    ],
  }).compile();
  app = module.createNestApplication({ logger: false, rawBody: true });
  const middleware = new TenantMiddleware();
  app.use(middleware.use.bind(middleware));
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  await app.init();
  prisma = app.get(PrismaService);
  const actions = [
    'view_conversations',
    'reply_conversations',
    'manage_conversations',
    'leads:read:all',
    'leads:read:messages',
    'leads:view',
    'notifications:view',
  ];
  const permissions = await system(
    async () =>
      await Promise.all(
        actions.map((action) => prisma.permission.create({ data: { action } })),
      ),
  );
  first = await seedTenant(permissions.map((permission) => permission.id));
  second = await seedTenant(permissions.map((permission) => permission.id));
});

afterAll(async () => {
  if (app) await app.close();
  if (admin) {
    if (dbName && /^omnidesk_s06_[a-f0-9]{32}$/.test(dbName))
      await admin.query(`DROP DATABASE "${dbName}" WITH (FORCE)`);
    await admin.end();
  }
});

it('limits HTTP conversation reads to the verified membership', async () => {
  const own = await request(app.getHttpServer())
    .get('/conversations')
    .set('Authorization', `Bearer ${first.token}`)
    .expect(200);
  const ids = own.body.map((row: { id: string }) => row.id);
  expect(ids).toContain(first.conversation.id);
  expect(ids).not.toContain(second.conversation.id);
  await request(app.getHttpServer())
    .get(`/conversations/${second.conversation.id}/messages`)
    .set('Authorization', `Bearer ${first.token}`)
    .expect(404);
  await request(app.getHttpServer())
    .get(`/conversations/${second.conversation.id}/messages`)
    .set('Authorization', `Bearer ${second.token}`)
    .expect(200);
});

it('denies cross-tenant HTTP writes and forged signed memberships before provider I/O', async () => {
  await request(app.getHttpServer())
    .post(`/conversations/${second.conversation.id}/messages`)
    .set('Authorization', `Bearer ${first.token}`)
    .send({ content: 'Unauthorized message' })
    .expect(404);
  await request(app.getHttpServer())
    .patch(`/conversations/${second.conversation.id}/toggle-ai`)
    .set('Authorization', `Bearer ${first.token}`)
    .expect(404);
  expect(providerSend).not.toHaveBeenCalled();
  const forged = new JwtService().sign(
    {
      sub: first.user.id,
      email: first.user.email,
      organizationId: second.organization.id,
      roleId: first.role.id,
    },
    { secret: accessSecret, expiresIn: '15m' },
  );
  await request(app.getHttpServer())
    .get('/conversations')
    .set('Authorization', `Bearer ${forged}`)
    .expect(401);
});

it('applies PII and message grants consistently to list, detail and history', async () => {
  const leadList = await request(app.getHttpServer())
    .get('/leads')
    .set('Authorization', `Bearer ${first.token}`)
    .expect(200);
  expect(leadList.body.data).toHaveLength(1);
  expect(leadList.body.data[0].phoneNumber).toContain('*');
  expect(leadList.body.data[0]).not.toHaveProperty('optOutReason');
  const leadDetail = await request(app.getHttpServer())
    .get(`/leads/${first.lead.id}`)
    .set('Authorization', `Bearer ${first.token}`)
    .expect(200);
  expect(leadDetail.body.phoneNumber).toBe(leadList.body.data[0].phoneNumber);
  await request(app.getHttpServer())
    .get('/leads')
    .query({
      filters: JSON.stringify([
        { field: 'email', operator: 'eq', value: 'private@example.invalid' },
      ]),
    })
    .set('Authorization', `Bearer ${first.token}`)
    .expect(400);
  const conversations = await request(app.getHttpServer())
    .get('/conversations')
    .set('Authorization', `Bearer ${first.token}`)
    .expect(200);
  expect(conversations.body[0].lead.phoneNumber).toContain('*');
  expect(conversations.body[0].externalContactId).toBeNull();
  const messagesPermission = await system(() =>
    prisma.permission.findUniqueOrThrow({
      where: { action: 'leads:read:messages' },
    }),
  );
  await system(() =>
    prisma.rolePermission.delete({
      where: {
        roleId_permissionId: {
          roleId: first.role.id,
          permissionId: messagesPermission.id,
        },
      },
    }),
  );
  try {
    await request(app.getHttpServer())
      .get(`/conversations/${first.conversation.id}/messages`)
      .set('Authorization', `Bearer ${first.token}`)
      .expect(403);
    const withoutMessages = await request(app.getHttpServer())
      .get('/conversations')
      .set('Authorization', `Bearer ${first.token}`)
      .expect(200);
    expect(withoutMessages.body[0].messages).toEqual([]);
  } finally {
    await system(() =>
      prisma.rolePermission.create({
        data: {
          roleId: first.role.id,
          permissionId: messagesPermission.id,
        },
      }),
    );
  }
});

it('persists patient notifications only for active tenant recipients with record visibility', async () => {
  const emitter = app.get(NotificationEmitterService);
  const crossTenant = await system(() =>
    emitter.send({
      organizationId: first.organization.id,
      userId: second.user.id,
      type: 'NEW_MESSAGE',
      title: 'Private name',
      body: 'Private message',
      referenceId: first.conversation.id,
      referenceType: 'CONVERSATION',
    }),
  );
  expect(crossTenant).toBeNull();
  const own = await tenantStorage.run(
    { organizationId: first.organization.id },
    async () =>
      await emitter.send({
        organizationId: first.organization.id,
        userId: first.user.id,
        type: 'NEW_MESSAGE',
        title: 'Private name',
        body: 'Private message',
        referenceId: first.conversation.id,
        referenceType: 'CONVERSATION',
      }),
  );
  expect(own?.title).toBe('New notification');
  expect(own?.body).toBe('Open the inbox to view details.');
});

it('scopes direct Message reads/writes through the conversation and rejects tenant raw SQL', async () => {
  await system(() =>
    prisma.aiPersona.upsert({
      where: { organizationId: second.organization.id },
      update: { clinicName: 'Original clinic' },
      create: {
        organizationId: second.organization.id,
        clinicName: 'Original clinic',
      },
    }),
  );
  await tenantStorage.run(
    { organizationId: first.organization.id, isSystemBypass: false },
    async () => {
      expect(
        await prisma.message.findMany({
          where: { conversationId: second.conversation.id },
        }),
      ).toEqual([]);
      await expect(
        prisma.lead.findUniqueOrThrow({ where: { id: second.lead.id } }),
      ).rejects.toThrow();
      await expect(
        prisma.lead.update({
          where: { id: second.lead.id },
          data: { firstName: 'tampered' },
        }),
      ).rejects.toThrow();
      const ownLead = await prisma.lead.update({
        where: { id: first.lead.id },
        data: { organizationId: second.organization.id },
      });
      expect(ownLead.organizationId).toBe(first.organization.id);
      const ownPersona = await prisma.aiPersona.upsert({
        where: { organizationId: second.organization.id },
        update: { clinicName: 'tampered' },
        create: {
          organizationId: second.organization.id,
          clinicName: 'Owned clinic',
        },
      });
      expect(ownPersona.organizationId).toBe(first.organization.id);
      expect(
        (
          await prisma.message.updateMany({
            where: { id: second.message.id },
            data: { content: 'tampered' },
          })
        ).count,
      ).toBe(0);
      await expect(
        prisma.message.create({
          data: {
            conversationId: second.conversation.id,
            content: 'tampered',
            type: 'LEAD_TEXT',
          },
        }),
      ).rejects.toThrow('MESSAGE_TENANT_MISMATCH');
      await expect(
        async () =>
          await prisma.$queryRaw`SELECT id FROM leads WHERE id = ${second.lead.id}::uuid`,
      ).rejects.toThrow('RAW_SQL_REQUIRES_AUDITED_SYSTEM_SCOPE');
    },
  );
  expect(
    (
      await system(() =>
        prisma.message.findUniqueOrThrow({ where: { id: second.message.id } }),
      )
    ).content,
  ).toBe('Synthetic private text');
  expect(
    (
      await system(() =>
        prisma.lead.findUniqueOrThrow({ where: { id: first.lead.id } }),
      )
    ).organizationId,
  ).toBe(first.organization.id);
  expect(
    (
      await system(() =>
        prisma.aiPersona.findUniqueOrThrow({
          where: { organizationId: second.organization.id },
        }),
      )
    ).clinicName,
  ).toBe('Original clinic');
});

it('accepts only signed Meta webhook payloads', async () => {
  const payload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'synthetic',
        changes: [
          {
            field: 'messages',
            value: {
              metadata: {
                display_phone_number: '15550000000',
                phone_number_id: randomUUID(),
              },
              messages: [
                {
                  from: '15550000000',
                  id: randomUUID(),
                  timestamp: '1',
                  type: 'text',
                  text: { body: 'Hi' },
                },
              ],
            },
          },
        ],
      },
    ],
  };
  const raw = JSON.stringify(payload);
  await request(app.getHttpServer())
    .post('/webhooks/whatsapp')
    .set('x-hub-signature-256', 'sha256=invalid')
    .set('Content-Type', 'application/json')
    .send(raw)
    .expect(401);
  expect(queueAdd).not.toHaveBeenCalled();
  const signature = `sha256=${createHmac('sha256', webhookSecret).update(raw).digest('hex')}`;
  await request(app.getHttpServer())
    .post('/webhooks/whatsapp')
    .set('x-hub-signature-256', signature)
    .set('Content-Type', 'application/json')
    .send(raw)
    .expect(200);
  expect(queueAdd).toHaveBeenCalledTimes(1);
});
