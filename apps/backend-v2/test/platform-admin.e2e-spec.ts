import { JwtService } from '@nestjs/jwt';
import { provisionOrganizationRolesAndPermissions } from '../src/auth/permission.provisioning';
import { PlatformModule } from '../src/platform/platform.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Client } from 'pg';
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module';
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
const root = resolve(__dirname, '..');
let app: INestApplication<Server>;
let prisma: PrismaService;
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
  dbName = `omnidesk_n4_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE DATABASE "${dbName}"`);
  const url = new URL(adminUrl);
  url.pathname = `/${dbName}`;
  process.env.DATABASE_URL = url.toString();
  process.env.JWT_ACCESS_SECRET = 'synthetic-access-secret';
  process.env.JWT_REFRESH_SECRET = 'synthetic-refresh-secret';
  process.env.PLATFORM_ADMIN_EMAILS = '';
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
      PlatformModule,
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
  const middleware = new TenantMiddleware(module.get(ConfigService));
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
});

afterAll(async () => {
  if (app) await app.close();
  if (admin) {
    if (dbName && /^omnidesk_n4_[a-f0-9]{32}$/.test(dbName))
      await admin.query(`DROP DATABASE "${dbName}" WITH (FORCE)`);
    await admin.end();
  }
});

async function identity(allow = true) {
  const user = await system(() =>
    prisma.user.create({
      data: {
        email: `${randomUUID()}@example.invalid`,
        firstName: 'Synthetic',
        lastName: 'Admin',
        status: 'ACTIVE',
        password_hash: '!synthetic',
      },
    }),
  );
  if (allow) {
    const config = app.get(ConfigService);
    config.set(
      'PLATFORM_ADMIN_EMAILS',
      `${config.get<string>('PLATFORM_ADMIN_EMAILS') ?? ''},${user.email.toUpperCase()}`,
    );
  }
  const token = new JwtService().sign(
    {
      sub: user.id,
      email: 'forged@example.invalid',
      organizationId: null,
      roleId: null,
      securityVersion: 1,
    },
    { secret: 'synthetic-access-secret', expiresIn: '15m' },
  );
  return { user, authorization: `Bearer ${token}` };
}
const api = () => request(app.getHttpServer());
const routes = [
  ['get', '/platform/clinics'],
  ['get', '/platform/invitations'],
  ['post', '/platform/invitations'],
  ['post', `/platform/invitations/${randomUUID()}/revoke`],
  ['post', '/platform/recovery'],
] as const;
async function hidden(authorization?: string) {
  for (const [method, path] of routes) {
    const req = api()[method](path);
    if (authorization) req.set('Authorization', authorization);
    await req.send({ email: 'synthetic@example.invalid' }).expect(404);
  }
}
describe('Platform administration', () => {
  it('hides every route for missing, malformed and non-admin credentials', async () => {
    await hidden();
    await hidden('Bearer malformed');
    await hidden((await identity(false)).authorization);
  });
  it('uses database identity and status; stale, suspended and deleted admins stay hidden', async () => {
    const admin = await identity();
    await system(() =>
      prisma.user.update({
        where: { id: admin.user.id },
        data: { status: 'SUSPENDED' },
      }),
    );
    await hidden(admin.authorization);
    await system(() =>
      prisma.user.update({
        where: { id: admin.user.id },
        data: { status: 'ACTIVE', securityVersion: 2 },
      }),
    );
    await hidden(admin.authorization);
    const deleted = await identity();
    await system(() =>
      prisma.user.update({
        where: { id: deleted.user.id },
        data: { deletedAt: new Date() },
      }),
    );
    await hidden(deleted.authorization);
  });
  it('empty allowlist disables routes and self flag; case-insensitive allowlist permits account-only admin', async () => {
    const admin = await identity();
    const config = app.get(ConfigService);
    config.set('PLATFORM_ADMIN_EMAILS', '');
    await hidden(admin.authorization);
    const off = await api()
      .get('/auth/me')
      .set('Authorization', admin.authorization)
      .expect(200);
    expect(off.body.user.isPlatformAdmin).toBe(false);
    config.set('PLATFORM_ADMIN_EMAILS', admin.user.email.toUpperCase());
    const on = await api()
      .get('/auth/me')
      .set('Authorization', admin.authorization)
      .expect(200);
    expect(on.body.user.isPlatformAdmin).toBe(true);
    await api()
      .get('/platform/clinics')
      .set('Authorization', admin.authorization)
      .expect(200);
  });
  it('returns only clinic metadata across clinics, active member counts and owner emails; audits reads', async () => {
    const admin = await identity();
    const org = await system(async () => {
      const org = await prisma.organization.create({
        data: { name: 'Synthetic founder clinic', slug: randomUUID() },
      });
      await provisionOrganizationRolesAndPermissions(prisma, org.id);
      const role = await prisma.role.findFirstOrThrow({
        where: { organizationId: org.id, name: 'Super Admin' },
      });
      await prisma.organizationMembership.create({
        data: {
          organizationId: org.id,
          userId: admin.user.id,
          roleId: role.id,
          status: 'ACTIVE',
        },
      });
      return org;
    });
    const result = await api()
      .get('/platform/clinics')
      .set('Authorization', admin.authorization)
      .expect(200);
    expect(result.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: org.id,
          memberCount: 1,
          ownerEmails: [admin.user.email],
          isActive: true,
        }),
      ]),
    );
    expect(
      Object.keys((result.body as Record<string, unknown>[])[0]).sort(),
    ).toEqual([
      'createdAt',
      'id',
      'isActive',
      'memberCount',
      'name',
      'ownerEmails',
    ]);
    await system(async () =>
      expect(
        await prisma.auditLog.count({
          where: { action: 'PLATFORM_CLINICS_LISTED', actor: admin.user.id },
        }),
      ).toBeGreaterThan(0),
    );
  });
  it('issues a first owner link accepted by existing activation and onboarding, lists pending metadata and audits no capabilities', async () => {
    const admin = await identity();
    const email = `${randomUUID()}@example.invalid`;
    const result = await api()
      .post('/platform/invitations')
      .set('Authorization', admin.authorization)
      .send({ email })
      .expect(201);
    const issued = result.body as {
      link: string;
      invitationId: string;
      expiresAt: string;
    };
    const link = new URL(issued.link);
    const token = new URLSearchParams(link.hash.slice(1)).get('token')!;
    expect(link.pathname).toBe('/accept-invitation');
    expect(issued.expiresAt).toBeDefined();
    const list = await api()
      .get('/platform/invitations')
      .set('Authorization', admin.authorization)
      .expect(200);
    expect(list.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: issued.invitationId,
          email,
          issuer: admin.user.id,
        }),
      ]),
    );
    expect(JSON.stringify(list.body)).not.toContain(token);
    await api().post('/auth/accept-invitation').send(body(token)).expect(200);
    const login = await api()
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    await api()
      .post('/organizations')
      .set('Authorization', `Bearer ${login.body.access_token}`)
      .send(workspace())
      .expect(201);
    await system(async () => {
      const logs = await prisma.auditLog.findMany({
        where: { actor: admin.user.id },
      });
      expect(
        logs.some(
          (l) =>
            l.action === 'OWNER_INVITATION_ISSUED' &&
            l.targetId === issued.invitationId,
        ),
      ).toBe(true);
      expect(JSON.stringify(logs)).not.toContain(token);
      const events = await prisma.accountActivationEvent.findMany({
        where: { invitationId: issued.invitationId, action: 'ISSUED' },
      });
      expect(events[0].actor).toBe(admin.user.id);
      expect(JSON.stringify(events)).not.toContain(token);
    });
  });
  it('revokes only first-owner invitations and makes their links unusable', async () => {
    const admin = await identity();
    const issue = await api()
      .post('/platform/invitations')
      .set('Authorization', admin.authorization)
      .send({ email: `${randomUUID()}@example.invalid` })
      .expect(201);
    const issued = issue.body as { invitationId: string; link: string };
    await api()
      .post(`/platform/invitations/${issued.invitationId}/revoke`)
      .set('Authorization', admin.authorization)
      .expect(200, { revoked: true });
    const token = new URLSearchParams(new URL(issued.link).hash.slice(1)).get(
      'token',
    )!;
    await api().post('/auth/accept-invitation').send(body(token)).expect(401);
    const other = await system(() =>
      prisma.accountInvitation.create({
        data: {
          userId: admin.user.id,
          issuedBy: admin.user.id,
          tokenHash: randomUUID(),
          purpose: 'CLINIC_MEMBERSHIP',
          expiresAt: new Date(Date.now() + 3600000),
        },
      }),
    );
    await api()
      .post(`/platform/invitations/${other.id}/revoke`)
      .set('Authorization', admin.authorization)
      .expect(400);
    await system(async () => {
      expect(
        (
          await prisma.accountInvitation.findUniqueOrThrow({
            where: { id: other.id },
          })
        ).revokedAt,
      ).toBeNull();
      expect(
        await prisma.auditLog.count({
          where: {
            actor: admin.user.id,
            targetId: issued.invitationId,
            action: 'OWNER_INVITATION_REVOKED',
          },
        }),
      ).toBe(1);
    });
  });
  it('issues audited recovery links usable once through existing recovery; rejects unavailable accounts and invalid inputs', async () => {
    const admin = await identity();
    const target = await identity(false);
    const result = await api()
      .post('/platform/recovery')
      .set('Authorization', admin.authorization)
      .send({ email: target.user.email.toUpperCase() })
      .expect(201);
    const issued = result.body as {
      link: string;
      invitationId: string;
      expiresAt: string;
    };
    const link = new URL(issued.link);
    const token = new URLSearchParams(link.hash.slice(1)).get('token')!;
    expect(link.pathname).toBe('/recover');
    expect(issued.expiresAt).toBeDefined();
    await api()
      .post('/auth/recovery/consume')
      .send({ token, newPassword: password })
      .expect(204);
    await api()
      .post('/auth/recovery/consume')
      .send({ token, newPassword: password })
      .expect(401);
    await api()
      .post('/auth/login')
      .send({ email: target.user.email, password })
      .expect(200);
    await api()
      .post('/platform/recovery')
      .set('Authorization', admin.authorization)
      .send({ email: 'missing@example.invalid' })
      .expect(400);
    await api()
      .post('/platform/invitations')
      .set('Authorization', admin.authorization)
      .send({ email: 'bad-email' })
      .expect(400);
    await api()
      .post('/platform/invitations')
      .set('Authorization', admin.authorization)
      .send({ email: 'good@example.invalid', clinicName: 'Unsupported' })
      .expect(400);
    await system(async () => {
      const logs = await prisma.auditLog.findMany({
        where: { actor: admin.user.id, targetId: issued.invitationId },
      });
      expect(logs[0].action).toBe('PASSWORD_RECOVERY_ISSUED');
      expect(JSON.stringify(logs)).not.toContain(token);
    });
  });
  it('throttles an administrator regardless of requested email', async () => {
    const admin = await identity();
    for (let i = 0; i < 10; i++)
      await api()
        .post('/platform/invitations')
        .set('Authorization', admin.authorization)
        .send({ email: `${randomUUID()}@example.invalid` })
        .expect(201);
    await api()
      .post('/platform/invitations')
      .set('Authorization', admin.authorization)
      .send({ email: `${randomUUID()}@example.invalid` })
      .expect(429);
  });
});
