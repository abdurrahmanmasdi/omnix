/* eslint-disable @typescript-eslint/no-unsafe-argument -- Synthetic Nest providers and supertest bodies. */
import { ThrottlerModule } from '@nestjs/throttler';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
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
import { NotificationsController } from '../src/notifications/notifications.controller';
import { NotificationsService } from '../src/notifications/notifications.service';
import { NotificationEmitterService } from '../src/notifications/notification-emitter.service';
import { WhatsappService } from '../src/webhooks/whatsapp.service';
import { OutboundAttemptService } from '../src/webhooks/outbound-attempt.service';
import { DeliveryAuthService } from '../src/webhooks/delivery-auth.service';
import { EventsGateway } from '../src/events/events/events.gateway';
import { TenantMiddleware } from '../src/core/tenant/tenant.middleware';
import { tenantStorage } from '../src/core/tenant/tenant.context';
import { safeDeploy } from '../src/credentials/deploy-cli';

/**
 * P1-10 permission matrix over HTTP: owner, coordinator, restricted staff and a
 * revoked user in each of two synthetic clinics. Requires the isolated
 * database named by UPGRADE_TEST_ADMIN_URL (same contract as the other e2e suites).
 */
jest.setTimeout(120_000);
const accessSecret = 'synthetic-p110-access-secret';
const system = <T>(fn: () => Promise<T>) =>
  tenantStorage.run({ isSystemBypass: true }, async () => await fn());
let admin: Client;
let dbName: string;
let app: INestApplication;
let prisma: PrismaService;

const READ_GRANTS = [
  'view_conversations',
  'leads:view',
  'leads:read:all',
  'leads:read:pii',
  'leads:read:messages',
  'notifications:view',
];
const GRANTS = {
  owner: [...READ_GRANTS, 'leads:manage', 'notifications:manage'],
  coordinator: READ_GRANTS,
  restricted: ['view_conversations', 'leads:view', 'notifications:view'],
} as const;
type Persona = keyof typeof GRANTS | 'revoked';

interface Clinic {
  id: string;
  assignedLeadId: string;
  unassignedLeadId: string;
  assignedConversationId: string;
  unassignedConversationId: string;
  secretText: string;
  tokens: Record<Persona, string>;
  userIds: Record<Persona, string>;
}

async function seedClinic(
  label: string,
  permissionIds: Map<string, string>,
): Promise<Clinic> {
  return system(async () => {
    const organization = await prisma.organization.create({
      data: { name: `Synthetic ${label}`, slug: randomUUID() },
    });
    const tokens = {} as Record<Persona, string>;
    const userIds = {} as Record<Persona, string>;
    const members = {} as Record<Persona, { id: string; roleId: string }>;
    for (const persona of [
      'owner',
      'coordinator',
      'restricted',
      'revoked',
    ] as const) {
      const grants =
        persona === 'revoked' ? GRANTS.coordinator : GRANTS[persona];
      const role = await prisma.role.create({
        data: {
          organizationId: organization.id,
          name: `${persona}-${label}`,
          slug: `${persona}-${randomUUID()}`,
        },
      });
      await prisma.rolePermission.createMany({
        data: grants.map((action) => ({
          roleId: role.id,
          permissionId: permissionIds.get(action)!,
        })),
      });
      const user = await prisma.user.create({
        data: {
          email: `${randomUUID()}@example.invalid`,
          password_hash: 'synthetic',
          firstName: persona,
          lastName: label,
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
      members[persona] = { id: user.id, roleId: role.id };
      userIds[persona] = user.id;
      tokens[persona] = new JwtService().sign(
        {
          sub: user.id,
          email: user.email,
          organizationId: organization.id,
          roleId: role.id,
          securityVersion: 1,
        },
        { secret: accessSecret, expiresIn: '15m' },
      );
    }
    const secretText = `private-text-${label}-${randomUUID()}`;
    const makeLead = async (assignee: string | null, phone: string) => {
      const lead = await prisma.lead.create({
        data: {
          organizationId: organization.id,
          phoneNumber: phone,
          firstName: `Lead${label}`,
          lastName: assignee ? 'Assigned' : 'Unassigned',
          country: 'US',
          timezone: 'UTC',
          primaryLanguage: 'en',
          assignedAgentId: assignee,
        },
      });
      const conversation = await prisma.conversation.create({
        data: {
          organizationId: organization.id,
          leadId: lead.id,
          externalContactId: lead.phoneNumber,
        },
      });
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          content: secretText,
          type: 'LEAD_TEXT',
        },
      });
      return { lead, conversation };
    };
    const assigned = await makeLead(
      members.restricted.id,
      label === 'A' ? '15550001001' : '15550002001',
    );
    const unassigned = await makeLead(
      null,
      label === 'A' ? '15550001002' : '15550002002',
    );
    // The revoked user's token was valid when issued; revoke the membership afterwards.
    await prisma.organizationMembership.updateMany({
      where: { organizationId: organization.id, userId: userIds.revoked },
      data: { deletedAt: new Date() },
    });
    return {
      id: organization.id,
      assignedLeadId: assigned.lead.id,
      unassignedLeadId: unassigned.lead.id,
      assignedConversationId: assigned.conversation.id,
      unassignedConversationId: unassigned.conversation.id,
      secretText,
      tokens,
      userIds,
    };
  });
}

let clinicA: Clinic;
let clinicB: Clinic;

beforeAll(async () => {
  const adminUrl = process.env.UPGRADE_TEST_ADMIN_URL;
  if (!adminUrl || new URL(adminUrl).hostname !== '127.0.0.1')
    throw new Error('ISOLATED_TEST_DATABASE_REQUIRED');
  admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  dbName = `omnidesk_p110_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE DATABASE "${dbName}"`);
  const url = new URL(adminUrl);
  url.pathname = `/${dbName}`;
  process.env.DATABASE_URL = url.toString();
  process.env.JWT_ACCESS_SECRET = accessSecret;
  process.env.JWT_REFRESH_SECRET = 'synthetic-p110-refresh-secret';
  process.env.JWT_ACCESS_EXPIRATION = '15m';
  process.env.JWT_REFRESH_EXPIRATION = '7d';
  await safeDeploy(resolve(__dirname, '..'));
  const module = await Test.createTestingModule({
    imports: [
      ThrottlerModule.forRoot([{ name: 'auth', ttl: 300000, limit: 10 }]),
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      PrismaModule,
      AuthModule,
    ],
    controllers: [
      ConversationsController,
      LeadsController,
      NotificationsController,
    ],
    providers: [
      ConversationsService,
      LeadsService,
      QueryBuilderService,
      NotificationsService,
      NotificationEmitterService,
      JwtAuthGuard,
      PermissionsGuard,
      OutboundAttemptService,
      DeliveryAuthService,
      { provide: WhatsappService, useValue: { sendTextMessage: jest.fn() } },
      {
        provide: EventsGateway,
        useValue: {
          broadcastNewMessage: jest.fn(),
          broadcastConversationUpdate: jest.fn().mockResolvedValue(undefined),
          broadcastLeadUpdate: jest.fn().mockResolvedValue(undefined),
          broadcastNotification: jest.fn().mockResolvedValue(undefined),
        },
      },
    ],
  }).compile();
  app = module.createNestApplication({ logger: false, rawBody: true });
  const middleware = new TenantMiddleware(module.get(ConfigService));
  app.use(middleware.use.bind(middleware));
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  await app.init();
  prisma = app.get(PrismaService);
  const actions = [...new Set([...GRANTS.owner, ...READ_GRANTS])];
  const created = await system(
    async () =>
      await Promise.all(
        actions.map((action) => prisma.permission.create({ data: { action } })),
      ),
  );
  const ids = new Map(created.map((p) => [p.action, p.id]));
  clinicA = await seedClinic('A', ids);
  clinicB = await seedClinic('B', ids);
});

afterAll(async () => {
  if (app) await app.close();
  if (admin) {
    if (dbName && /^omnidesk_p110_[a-f0-9]{32}$/.test(dbName))
      await admin.query(`DROP DATABASE "${dbName}" WITH (FORCE)`);
    await admin.end();
  }
});

const get = (clinic: Clinic, persona: Persona, path: string) =>
  request(app.getHttpServer())
    .get(path)
    .set('Authorization', `Bearer ${clinic.tokens[persona]}`);

const ids = (body: unknown): string[] => {
  const rows = Array.isArray(body)
    ? body
    : ((body as { data?: unknown[]; items?: unknown[] }).data ??
      (body as { items?: unknown[] }).items ??
      []);
  return (rows as { id: string }[]).map((row) => row.id);
};

describe('lead list and detail', () => {
  it.each(['owner', 'coordinator'] as const)(
    '%s sees both leads of their own clinic with the right PII exposure',
    async (persona) => {
      const res = await get(clinicA, persona, '/leads').expect(200);
      expect(ids(res.body).sort()).toEqual(
        [clinicA.assignedLeadId, clinicA.unassignedLeadId].sort(),
      );
      expect(JSON.stringify(res.body)).not.toContain(clinicB.assignedLeadId);
      expect(JSON.stringify(res.body)).toContain('15550001001');
    },
  );

  it('restricted staff see only the assigned lead, with PII masked', async () => {
    const res = await get(clinicA, 'restricted', '/leads').expect(200);
    expect(ids(res.body)).toEqual([clinicA.assignedLeadId]);
    expect(JSON.stringify(res.body)).not.toContain('15550001001');
    expect(res.body.data[0].phoneNumber).toContain('*');
  });

  it('restricted staff cannot open an unassigned lead', async () => {
    await get(
      clinicA,
      'restricted',
      `/leads/${clinicA.unassignedLeadId}`,
    ).expect(403);
  });

  it('restricted staff cannot filter by email without the PII grant', async () => {
    await get(clinicA, 'restricted', '/leads')
      .query({
        filters: JSON.stringify([
          { field: 'email', operator: 'eq', value: 'x@example.invalid' },
        ]),
      })
      .expect(400);
  });

  it.each(['owner', 'coordinator', 'restricted'] as const)(
    '%s of clinic A cannot read clinic B leads',
    async (persona) => {
      await get(clinicA, persona, `/leads/${clinicB.assignedLeadId}`).expect(
        404,
      );
      await get(clinicA, persona, `/leads/${clinicB.unassignedLeadId}`).expect(
        404,
      );
    },
  );

  it('only users with leads:manage may change leads', async () => {
    const patch = (persona: Persona) =>
      request(app.getHttpServer())
        .patch(`/leads/${clinicA.assignedLeadId}`)
        .set('Authorization', `Bearer ${clinicA.tokens[persona]}`)
        .send({ firstName: 'Changed' });
    await patch('coordinator').expect(403);
    await patch('restricted').expect(403);
  });
});

describe('conversations, message history and media content', () => {
  it('owner and coordinator list both conversations; restricted lists only the assigned one', async () => {
    for (const persona of ['owner', 'coordinator'] as const) {
      const res = await get(clinicA, persona, '/conversations').expect(200);
      expect(ids(res.body).sort()).toEqual(
        [
          clinicA.assignedConversationId,
          clinicA.unassignedConversationId,
        ].sort(),
      );
    }
    const restricted = await get(
      clinicA,
      'restricted',
      '/conversations',
    ).expect(200);
    expect(ids(restricted.body)).toEqual([clinicA.assignedConversationId]);
  });

  it('restricted staff get no message content and no external contact id from list or detail', async () => {
    const list = await get(clinicA, 'restricted', '/conversations').expect(200);
    expect(JSON.stringify(list.body)).not.toContain(clinicA.secretText);
    expect(JSON.stringify(list.body)).not.toContain('15550001001');
    const detail = await get(
      clinicA,
      'restricted',
      `/conversations/${clinicA.assignedConversationId}`,
    ).expect(200);
    expect(JSON.stringify(detail.body)).not.toContain(clinicA.secretText);
    expect(JSON.stringify(detail.body)).not.toContain('15550001001');
  });

  it('restricted staff are refused message history, and unassigned conversations altogether', async () => {
    await get(
      clinicA,
      'restricted',
      `/conversations/${clinicA.assignedConversationId}/messages`,
    ).expect(403);
    const unassignedDetail = await get(
      clinicA,
      'restricted',
      `/conversations/${clinicA.unassignedConversationId}`,
    );
    expect([403, 404]).toContain(unassignedDetail.status);
    const unassignedHistory = await get(
      clinicA,
      'restricted',
      `/conversations/${clinicA.unassignedConversationId}/messages`,
    );
    expect([403, 404]).toContain(unassignedHistory.status);
  });

  it('coordinator reads history of their own clinic only', async () => {
    const own = await get(
      clinicA,
      'coordinator',
      `/conversations/${clinicA.assignedConversationId}/messages`,
    ).expect(200);
    expect(JSON.stringify(own.body)).toContain(clinicA.secretText);
    const foreign = await get(
      clinicA,
      'coordinator',
      `/conversations/${clinicB.assignedConversationId}/messages`,
    );
    expect([403, 404]).toContain(foreign.status);
    expect(JSON.stringify(foreign.body)).not.toContain(clinicB.secretText);
  });
});

describe('revoked users', () => {
  it.each([
    '/leads',
    '/conversations',
    '/notifications',
    '/notifications/unread-count',
  ])('a revoked membership gets 401 from %s', async (path) => {
    await get(clinicA, 'revoked', path).expect(401);
    await get(clinicB, 'revoked', path).expect(401);
  });

  it('a recovery-style security version bump revokes an otherwise valid session', async () => {
    await system(() =>
      prisma.user.update({
        where: { id: clinicB.userIds.owner },
        data: { securityVersion: { increment: 1 } },
      }),
    );
    await get(clinicB, 'owner', '/leads').expect(401);
  });

  it('a suspended user is refused immediately', async () => {
    await system(() =>
      prisma.user.update({
        where: { id: clinicB.userIds.coordinator },
        data: { status: 'SUSPENDED' },
      }),
    );
    await get(clinicB, 'coordinator', '/conversations').expect(401);
  });
});

describe('notifications', () => {
  it('generalizes text, hides unauthorized records, and never crosses clinics', async () => {
    const emitter = app.get(NotificationEmitterService);
    await tenantStorage.run({ organizationId: clinicA.id }, async () => {
      await emitter.send({
        organizationId: clinicA.id,
        userId: clinicA.userIds.coordinator,
        type: 'NEW_MESSAGE',
        title: 'Message from LeadA',
        body: clinicA.secretText,
        referenceId: clinicA.assignedConversationId,
        referenceType: 'CONVERSATION',
      });
      // restricted staff may be notified about their own assigned record only
      const forbidden = await emitter.send({
        organizationId: clinicA.id,
        userId: clinicA.userIds.restricted,
        type: 'NEW_MESSAGE',
        title: 'Message from LeadA',
        body: clinicA.secretText,
        referenceId: clinicA.unassignedConversationId,
        referenceType: 'CONVERSATION',
      });
      expect(forbidden).toBeNull();
      await emitter.send({
        organizationId: clinicA.id,
        userId: clinicA.userIds.restricted,
        type: 'NEW_MESSAGE',
        title: 'Message from LeadA',
        body: clinicA.secretText,
        referenceId: clinicA.assignedConversationId,
        referenceType: 'CONVERSATION',
      });
    });
    const coordinator = await get(
      clinicA,
      'coordinator',
      '/notifications',
    ).expect(200);
    expect(JSON.stringify(coordinator.body)).toContain(clinicA.secretText);
    const restricted = await get(
      clinicA,
      'restricted',
      '/notifications',
    ).expect(200);
    expect(restricted.body).toHaveLength(1);
    expect(JSON.stringify(restricted.body)).not.toContain(clinicA.secretText);
    expect(JSON.stringify(restricted.body)).not.toContain('LeadA');
    // clinic B users never see clinic A notifications
    const other = await get(clinicB, 'owner', '/notifications');
    expect(JSON.stringify(other.body)).not.toContain(clinicA.secretText);

    // KI-011: a stored full-text notification is generalized after a grant downgrade.
    await system(() =>
      prisma.rolePermission.deleteMany({
        where: {
          role: {
            organizationId: clinicA.id,
            slug: { startsWith: 'coordinator' },
          },
          permission: {
            action: { in: ['leads:read:pii', 'leads:read:messages'] },
          },
        },
      }),
    );
    const downgraded = await get(
      clinicA,
      'coordinator',
      '/notifications',
    ).expect(200);
    expect(JSON.stringify(downgraded.body)).not.toContain(clinicA.secretText);
    expect(JSON.stringify(downgraded.body)).not.toContain('LeadA');
  });
});
