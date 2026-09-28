import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthModule } from '../src/auth/auth.module';
import { EventsModule } from '../src/events/events.module';
import { TenantMiddleware } from '../src/core/tenant/tenant.middleware';
import { tenantStorage } from '../src/core/tenant/tenant.context';
import { safeDeploy } from '../src/credentials/deploy-cli';
import { io, Socket } from 'socket.io-client';
import { NotificationEmitterService } from '../src/notifications/notification-emitter.service';
import { NotificationsModule } from '../src/notifications/notification.module';
import { NotificationsService } from '../src/notifications/notifications.service';

jest.setTimeout(120_000);
const accessSecret = 'synthetic-s07-access-secret';
const system = <T>(fn: () => Promise<T>) =>
  tenantStorage.run({ isSystemBypass: true }, async () => await fn());
let admin: Client;
let dbName: string;
let app: INestApplication;
let prisma: PrismaService;
let notificationsService: NotificationsService;
let emitter: NotificationEmitterService;

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

    // We create two users in the same organization for the assignment test
    const user1 = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.invalid`,
        password_hash: 'synthetic',
        firstName: 'Synthetic',
        lastName: 'Staff1',
        status: 'ACTIVE',
      },
    });
    await prisma.organizationMembership.create({
      data: {
        organizationId: organization.id,
        userId: user1.id,
        roleId: role.id,
        status: 'ACTIVE',
      },
    });

    const user2 = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.invalid`,
        password_hash: 'synthetic',
        firstName: 'Synthetic',
        lastName: 'Staff2',
        status: 'ACTIVE',
      },
    });
    const membership2 = await prisma.organizationMembership.create({
      data: {
        organizationId: organization.id,
        userId: user2.id,
        roleId: role.id,
        status: 'ACTIVE',
      },
    });

    const lead = await prisma.lead.create({
      data: {
        organizationId: organization.id,
        phoneNumber: `1555${Math.floor(1000000 + Math.random() * 9000000)}`,
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

    const token1 = new JwtService().sign(
      { sub: user1.id, email: user1.email, organizationId: organization.id, roleId: role.id },
      { secret: accessSecret, expiresIn: '15m' },
    );
    const token2 = new JwtService().sign(
      { sub: user2.id, email: user2.email, organizationId: organization.id, roleId: role.id },
      { secret: accessSecret, expiresIn: '15m' },
    );
    return { organization, role, user1, user2, membership2, lead, conversation, message, token1, token2 };
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
  dbName = `omnidesk_s07_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE DATABASE "${dbName}"`);
  const url = new URL(adminUrl);
  url.pathname = `/${dbName}`;
  process.env.DATABASE_URL = url.toString();
  process.env.JWT_ACCESS_SECRET = accessSecret;
  process.env.JWT_REFRESH_SECRET = 'synthetic-s07-refresh-secret';
  await safeDeploy(resolve(__dirname, '..'));

  const module = await Test.createTestingModule({
    providers: [NotificationEmitterService],
    imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), PrismaModule, AuthModule, EventsModule, NotificationsModule],
  }).compile();

  app = module.createNestApplication({ logger: false });
  const middleware = new TenantMiddleware();
  app.use(middleware.use.bind(middleware));
  await app.listen(0);

  prisma = app.get(PrismaService);
  notificationsService = app.get(NotificationsService);
  emitter = app.get(NotificationEmitterService);

  const actions = ['view_conversations', 'leads:read:all', 'leads:read:pii', 'leads:read:messages', 'notifications:view'];
  const permissions = await system(async () =>
    await Promise.all(actions.map((action) => prisma.permission.create({ data: { action } }))),
  );

  first = await seedTenant(permissions.map((p) => p.id));
  second = await seedTenant(permissions.map((p) => p.id));
});

afterAll(async () => {
  if (app) await app.close();
  if (admin) {
    if (dbName && /^omnidesk_s07_[a-f0-9]{32}$/.test(dbName)) {
      await admin.query(`DROP DATABASE "${dbName}" WITH (FORCE)`);
    }
    await admin.end();
  }
});

function connectSocket(token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const port = app.getHttpServer().address().port;
    const socket = io(`http://127.0.0.1:${port}`, { auth: { token }, reconnection: false });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });
}

it('enforces connected-socket assignment and permission revocation mid-session', async () => {
  // Connect both users from the first tenant, and one from the second tenant
  const socket1 = await connectSocket(first.token1);
  const socket2 = await connectSocket(first.token2);
  const socket3 = await connectSocket(second.token1);

  const socket2Events: any[] = [];
  socket2.on('onLeadUpdate', (data) => socket2Events.push(data));

  // Step 1: user2 has leads:read:all (from role). We broadcast an update.
  const eventsGateway = app.get(require('../src/events/events/events.gateway').EventsGateway);
  await eventsGateway.broadcastLeadUpdate(first.organization.id, { ...first.lead, summary: 'initial' });

  await new Promise((r) => setTimeout(r, 100)); // wait for emit
  expect(socket2Events.length).toBe(1); // User2 received the update

  // Step 2: Revoke leads:read:all from user2 via override
  const readAllPermission = await system(() => prisma.permission.findUniqueOrThrow({ where: { action: 'leads:read:all' } }));
  await system(() => prisma.membershipPermissionOverride.create({
    data: {
      membershipId: first.membership2.id,
      permissionId: readAllPermission.id,
      is_granted: false,
    }
  }));

  // Revalidate sockets (this should disconnect or update socket2's permissions)
  await eventsGateway['revalidateConnections'](); // bypass private to force immediate sync

  // Broadcast again
  await eventsGateway.broadcastLeadUpdate(first.organization.id, { ...first.lead, summary: 'after-revoke' });
  await new Promise((r) => setTimeout(r, 100));
  // User2 no longer has leads:read:all and is not assigned, so they should NOT receive this update.
  expect(socket2Events.length).toBe(1);

  // Step 3: Assign lead to user2
  await system(() => prisma.lead.update({
    where: { id: first.lead.id },
    data: { assignedAgentId: first.user2.id }
  }));

  // Broadcast again
  await eventsGateway.broadcastLeadUpdate(first.organization.id, { ...first.lead, summary: 'after-assign', assignedAgentId: first.user2.id });
  await new Promise((r) => setTimeout(r, 100));
  // Now User2 should receive the update because they are assigned
  expect(socket2Events.length).toBe(2);

  socket1.disconnect();
  socket2.disconnect();
  socket3.disconnect();
});

it('filters previously persisted notifications when a recipient loses record access', async () => {
  await tenantStorage.run({ organizationId: first.organization.id }, async () => {
    // Step 1: Create a notification for user2 about a conversation
    await emitter.send({
      organizationId: first.organization.id,
      userId: first.user2.id,
      type: 'NEW_MESSAGE',
      title: 'test',
      body: 'test',
      referenceId: first.conversation.id,
      referenceType: 'CONVERSATION',
    });

    // Let's grant leads:read:all back to user2
    const readAllPermission = await prisma.permission.findUniqueOrThrow({ where: { action: 'leads:read:all' } });
    await prisma.membershipPermissionOverride.update({
      where: { membershipId_permissionId: { membershipId: first.membership2.id, permissionId: readAllPermission.id } },
      data: { is_granted: true }
    });

    // They should see it
    let notifications = await notificationsService.getUserNotifications(first.organization.id, first.user2.id);
    expect(notifications.length).toBeGreaterThan(0);

    let unreadCount = await notificationsService.getUnreadCount(first.organization.id, first.user2.id);
    expect(unreadCount).toBeGreaterThan(0);

    // Step 2: Revoke leads:read:all again, and ensure user2 is NOT assigned to the conversation/lead
    await prisma.membershipPermissionOverride.update({
      where: { membershipId_permissionId: { membershipId: first.membership2.id, permissionId: readAllPermission.id } },
      data: { is_granted: false }
    });
    await prisma.lead.update({
      where: { id: first.lead.id },
      data: { assignedAgentId: null }
    });

    // They should no longer see it
    notifications = await notificationsService.getUserNotifications(first.organization.id, first.user2.id);
    expect(notifications.length).toBe(0);

    unreadCount = await notificationsService.getUnreadCount(first.organization.id, first.user2.id);
    expect(unreadCount).toBe(0);

    // Step 3: Assign the conversation to user2
    await prisma.conversation.update({
      where: { id: first.conversation.id },
      data: { assignedAgentId: first.user2.id }
    });

    // They should see it again
    notifications = await notificationsService.getUserNotifications(first.organization.id, first.user2.id);
    expect(notifications.length).toBeGreaterThan(0);

    unreadCount = await notificationsService.getUnreadCount(first.organization.id, first.user2.id);
    expect(unreadCount).toBeGreaterThan(0);
  });
});
