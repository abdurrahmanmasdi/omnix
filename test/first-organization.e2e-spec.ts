import { ThrottlerModule } from '@nestjs/throttler';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Client } from 'pg';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module';
import { InvitationsService } from '../src/auth/invitations.service';
import { OrganizationsModule } from '../src/organizations/organizations.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantMiddleware } from '../src/core/tenant/tenant.middleware';
import { tenantStorage } from '../src/core/tenant/tenant.context';
import { ChannelsController } from '../src/channels/channels.controller';
import { ChannelsService } from '../src/channels/channels.service';
import { WhatsappService } from '../src/webhooks/whatsapp.service';
import { InstagramService } from '../src/webhooks/instagram.service';
import { CredentialsService } from '../src/credentials/credentials.service';
import { HubspotAdapter } from '../src/modules/integration/crm/adapters/hubspot.adapter';
import { safeDeploy } from '../src/credentials/deploy-cli';

jest.setTimeout(120_000);
const password = 'Synthetic-pilot-password-123';
const operator = 'synthetic-operator';
const root = resolve(__dirname, '..');
let app: INestApplication<Server>;
let prisma: PrismaService;
let invitations: InvitationsService;
let admin: Client;
let dbName: string;
const body = (token: string) => ({
  token,
  password,
  firstName: 'Synthetic',
  lastName: 'Founder',
});
const workspace = (slug = `clinic-${randomUUID()}`) => ({
  name: 'Synthetic Clinic',
  slug,
});
const system = <T>(fn: () => Promise<T>) =>
  tenantStorage.run({ isSystemBypass: true }, async () => await fn());

beforeAll(async () => {
  const adminUrl = process.env.UPGRADE_TEST_ADMIN_URL;
  if (!adminUrl || new URL(adminUrl).hostname !== '127.0.0.1')
    throw new Error('ISOLATED_TEST_DATABASE_REQUIRED');
  admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  dbName = `omnidesk_s03_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE DATABASE "${dbName}"`);
  const url = new URL(adminUrl);
  url.pathname = `/${dbName}`;
  process.env.DATABASE_URL = url.toString();
  process.env.JWT_ACCESS_SECRET = 'synthetic-access-secret';
  process.env.JWT_REFRESH_SECRET = 'synthetic-refresh-secret';
  process.env.JWT_ACCESS_EXPIRATION = '15m';
  process.env.JWT_REFRESH_EXPIRATION = '7d';
  await safeDeploy(root);
  const module = await Test.createTestingModule({
    imports: [
      ThrottlerModule.forRoot([{ name: 'auth', ttl: 300000, limit: 10 }]),
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      PrismaModule,
      AuthModule,
      OrganizationsModule,
    ],
    controllers: [ChannelsController],
    providers: [
      ChannelsService,
      { provide: WhatsappService, useValue: {} },
      { provide: InstagramService, useValue: {} },
      { provide: CredentialsService, useValue: {} },
      { provide: HubspotAdapter, useValue: {} },
    ],
  }).compile();
  app = module.createNestApplication<INestApplication<Server>>({
    logger: false,
  });
  app.use(cookieParser());
  const middleware = new TenantMiddleware();
  app.use(middleware.use.bind(middleware));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  prisma = app.get(PrismaService);
  invitations = app.get(InvitationsService);
});

afterAll(async () => {
  if (app) await app.close();
  if (admin) {
    if (dbName && /^omnidesk_s03_[a-f0-9]{32}$/.test(dbName))
      await admin.query(`DROP DATABASE "${dbName}" WITH (FORCE)`);
    await admin.end();
  }
});

async function invited() {
  const email = `${randomUUID()}@example.invalid`;
  return { email, ...(await invitations.issue(email, operator)) };
}
async function active() {
  const invitation = await invited();
  await request(app.getHttpServer())
    .post('/auth/accept-invitation')
    .send(body(invitation.token))
    .expect(200);
  const login = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email: invitation.email, password })
    .expect(200);
  return { ...invitation, accessToken: login.body.access_token as string };
}

it('rejects public signup and the legacy reusable verification route without creating a user', async () => {
  const count = await prisma.user.count();
  const res = await request(app.getHttpServer())
    .post('/auth/signup')
    .send({
      email: 'public@example.invalid',
      password,
      firstName: 'Synthetic',
      lastName: 'Public',
    })
    .expect(403);
  expect(res.headers['set-cookie']).toBeUndefined();
  await request(app.getHttpServer())
    .get('/auth/verify-email?token=synthetic')
    .expect(410);
  expect(await prisma.user.count()).toBe(count);
});

it('uses the operator CLI invitation → acceptance → login → workspace → tenant endpoint, without direct DB activation', async () => {
  const email = `${randomUUID()}@example.invalid`;
  const dir = mkdtempSync(join(tmpdir(), 'omnidesk-invite-test-'));
  try {
    const output = join(dir, 'invitation.txt');
    const stdout = execFileSync(
      process.execPath,
      [
        '-r',
        'ts-node/register',
        'src/auth/invite-cli.ts',
        '--email',
        email,
        '--operator',
        operator,
        '--origin',
        'http://localhost:3001',
        '--output',
        output,
      ],
      { cwd: root, env: process.env, stdio: 'pipe' },
    ).toString();
    const link = new URL(readFileSync(output, 'utf8').trim());
    const token = new URLSearchParams(link.hash.slice(1)).get('token')!;
    expect(statSync(output).mode & 0o777).toBe(0o600);
    expect(stdout.includes(token)).toBe(false);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.status).toBe('PENDING');
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(401);
    const stored = await system(() => prisma.accountInvitation.findFirstOrThrow({
      where: { userId: user.id },
    }));
    expect(stored.tokenHash === token).toBe(false);
    const accepted = await request(app.getHttpServer())
      .post('/auth/accept-invitation')
      .send(body(token))
      .expect(200);
    expect(accepted.headers['set-cookie']).toBeUndefined();
    expect(accepted.body.access_token).toBeUndefined();
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    expect(login.headers['set-cookie'][0]).toContain('HttpOnly');
    await request(app.getHttpServer())
      .get('/channels')
      .auth(login.body.access_token as string, { type: 'bearer' })
      .expect(401);
    const created = await request(app.getHttpServer())
      .post('/organizations')
      .auth(login.body.access_token as string, { type: 'bearer' })
      .send(workspace())
      .expect(201);
    const orgId = created.body.organizationId as string;
    await request(app.getHttpServer())
      .get('/channels')
      .auth(created.body.access_token as string, { type: 'bearer' })
      .expect(200, []);
    await system(async () => {
      expect(
        await prisma.aiPersona.count({ where: { organizationId: orgId } }),
      ).toBe(1);
      const roles = await prisma.role.findMany({
        where: { organizationId: orgId },
      });
      expect(roles.map((role) => role.name).sort()).toEqual([
        'Agent',
        'Manager',
        'Super Admin',
      ]);
      expect(
        await prisma.rolePermission.count({
          where: { roleId: { in: roles.map((role) => role.id) } },
        }),
      ).toBeGreaterThan(0);
      expect(
        await prisma.organizationMembership.count({
          where: { organizationId: orgId, userId: user.id, status: 'ACTIVE' },
        }),
      ).toBe(1);
    });
    expect(
      (
        await prisma.accountActivationEvent.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: 'asc' },
        })
      ).map((event) => event.action),
    ).toEqual(['ISSUED', 'ACCEPTED']);
    await request(app.getHttpServer())
      .post('/auth/accept-invitation')
      .send(body(token))
      .expect(401);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it.each(['expired', 'revoked', 'wrong-purpose'] as const)(
  'rejects a %s invitation without activating the account',
  async (kind) => {
    const invite = await invited();
    if (kind === 'expired')
      await system(() => prisma.accountInvitation.update({
        where: { id: invite.invitationId },
        data: { expiresAt: new Date(0) },
      }));
    if (kind === 'revoked')
      await invitations.revoke(invite.invitationId, operator);
    if (kind === 'wrong-purpose')
      await system(() => prisma.accountInvitation.update({
        where: { id: invite.invitationId },
        data: { purpose: 'EMAIL_VERIFICATION' },
      }));
    await request(app.getHttpServer())
      .post('/auth/accept-invitation')
      .send(body(invite.token))
      .expect(401);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: invite.userId } }))
        .status,
    ).toBe('PENDING');
  },
);

it('rejects a forged token, malformed fields and an attempt to choose a different email', async () => {
  const invite = await invited();
  await request(app.getHttpServer())
    .post('/auth/accept-invitation')
    .send(body('0'.repeat(64)))
    .expect(401);
  await request(app.getHttpServer())
    .post('/auth/accept-invitation')
    .send({ ...body(invite.token), email: 'other@example.invalid' })
    .expect(400);
  await request(app.getHttpServer())
    .post('/auth/accept-invitation')
    .send({ ...body(invite.token), password: 'short' })
    .expect(400);
  await request(app.getHttpServer())
    .post('/auth/accept-invitation')
    .send({ ...body(invite.token), firstName: '   ' })
    .expect(400);
  expect(
    (await prisma.user.findUniqueOrThrow({ where: { id: invite.userId } }))
      .status,
  ).toBe('PENDING');
});

it('accepts a capability exactly once under simultaneous requests', async () => {
  const invite = await invited();
  const responses = await Promise.all(
    [1, 2].map(() =>
      request(app.getHttpServer())
        .post('/auth/accept-invitation')
        .send(body(invite.token)),
    ),
  );
  expect(responses.map((res) => res.status).sort()).toEqual([200, 401]);
  expect(
    await prisma.accountActivationEvent.count({
      where: { invitationId: invite.invitationId, action: 'ACCEPTED' },
    }),
  ).toBe(1);
});

it('rate limits operator reissue, revokes old invitations and audits replacement', async () => {
  const invite = await invited();
  await expect(invitations.issue(invite.email, operator)).rejects.toThrow(
    'INVITATION_ISSUE_RATE_LIMIT',
  );
  await system(() => prisma.accountInvitation.update({
    where: { id: invite.invitationId },
    data: { createdAt: new Date(Date.now() - 61_000) },
  }));
  const replacement = await invitations.issue(invite.email, operator);
  await request(app.getHttpServer())
    .post('/auth/accept-invitation')
    .send(body(invite.token))
    .expect(401);
  await request(app.getHttpServer())
    .post('/auth/accept-invitation')
    .send(body(replacement.token))
    .expect(200);
});

it.each(['PENDING', 'SUSPENDED', 'DELETED'] as const)(
  'rejects %s users at login and first-workspace authorization',
  async (status) => {
    const account = await active();
    await prisma.user.update({
      where: { id: account.userId },
      data: status === 'DELETED' ? { deletedAt: new Date() } : { status },
    });
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: account.email, password })
      .expect(401);
    await request(app.getHttpServer())
      .post('/organizations')
      .auth(account.accessToken, { type: 'bearer' })
      .send(workspace())
      .expect(401);
  },
);

it('does not activate a suspended account with an older pending invitation', async () => {
  const invite = await invited();
  await prisma.user.update({
    where: { id: invite.userId },
    data: { status: 'SUSPENDED' },
  });
  await request(app.getHttpServer())
    .post('/auth/accept-invitation')
    .send(body(invite.token))
    .expect(401);
  await expect(invitations.issue(invite.email, operator)).rejects.toThrow(
    'INVITATION_ACCOUNT_NOT_PENDING',
  );
});

it('returns one workspace for simultaneous first-workspace requests and repeats', async () => {
  const account = await active();
  const responses = await Promise.all(
    [1, 2].map(() =>
      request(app.getHttpServer())
        .post('/organizations')
        .auth(account.accessToken, { type: 'bearer' })
        .send(workspace()),
    ),
  );
  expect(responses.map((res) => res.status)).toEqual([201, 201]);
  expect(responses[0].body.organizationId).toBe(
    responses[1].body.organizationId,
  );
  await system(async () =>
    expect(
      await prisma.organizationMembership.count({
        where: { userId: account.userId },
      }),
    ).toBe(1),
  );
});

it('returns 409 for a competing slug and leaves the losing user unprovisioned', async () => {
  const accounts = [await active(), await active()];
  const dto = workspace();
  const responses = await Promise.all(
    accounts.map((account) =>
      request(app.getHttpServer())
        .post('/organizations')
        .auth(account.accessToken, { type: 'bearer' })
        .send(dto),
    ),
  );
  expect(responses.map((res) => res.status).sort()).toEqual([201, 409]);
  const loser = accounts[responses.findIndex((res) => res.status === 409)];
  await system(async () => {
    expect(await prisma.organization.count({ where: { slug: dto.slug } })).toBe(
      1,
    );
    expect(
      await prisma.organizationMembership.count({
        where: { userId: loser.userId },
      }),
    ).toBe(0);
  });
});

it('rolls back organization, persona, roles and permissions when membership creation fails', async () => {
  const account = await active();
  const dto = workspace();
  const before = await system(async () => ({
    roles: await prisma.role.count(),
    personas: await prisma.aiPersona.count(),
    grants: await prisma.rolePermission.count(),
  }));
  await system(async () => {
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION reject_test_membership() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic provisioning failure'; END $$`,
    );
    await prisma.$executeRawUnsafe(
      'CREATE TRIGGER reject_test_membership BEFORE INSERT ON organization_memberships FOR EACH ROW EXECUTE FUNCTION reject_test_membership()',
    );
  });
  try {
    await request(app.getHttpServer())
      .post('/organizations')
      .auth(account.accessToken, { type: 'bearer' })
      .send(dto)
      .expect(500);
    await system(async () => {
      expect(
        await prisma.organization.count({ where: { slug: dto.slug } }),
      ).toBe(0);
      expect(
        await prisma.organizationMembership.count({
          where: { userId: account.userId },
        }),
      ).toBe(0);
      expect(await prisma.role.count()).toBe(before.roles);
      expect(await prisma.aiPersona.count()).toBe(before.personas);
      expect(await prisma.rolePermission.count()).toBe(before.grants);
    });
  } finally {
    await system(async () => {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER reject_test_membership ON organization_memberships',
      );
      await prisma.$executeRawUnsafe('DROP FUNCTION reject_test_membership()');
    });
  }
});

it('rejects a tenant token after membership revocation or account deletion', async () => {
  const account = await active();
  const created = await request(app.getHttpServer())
    .post('/organizations')
    .auth(account.accessToken, { type: 'bearer' })
    .send(workspace())
    .expect(201);
  await system(() =>
    prisma.organizationMembership.updateMany({
      where: { userId: account.userId },
      data: { deletedAt: new Date() },
    }),
  );
  await request(app.getHttpServer())
    .get('/channels')
    .auth(created.body.access_token as string, { type: 'bearer' })
    .expect(401);
  await prisma.user.update({
    where: { id: account.userId },
    data: { deletedAt: new Date() },
  });
  await request(app.getHttpServer())
    .get('/channels')
    .auth(created.body.access_token as string, { type: 'bearer' })
    .expect(401);
});
