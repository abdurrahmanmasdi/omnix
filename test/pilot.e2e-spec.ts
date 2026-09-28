/* eslint-disable @typescript-eslint/no-unsafe-argument -- Supertest response bodies are untyped at the HTTP boundary. */
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { InvitationsService } from '../src/auth/invitations.service';
import { WhatsappService } from '../src/webhooks/whatsapp.service';
import { tenantStorage } from '../src/core/tenant/tenant.context';
import { safeDeploy } from '../src/credentials/deploy-cli';

jest.setTimeout(120_000);
const system = <T>(fn: () => Promise<T>) =>
  tenantStorage.run({ isSystemBypass: true }, async () => await fn());
let admin: Client;
let dbName: string;
let app: INestApplication;
let prisma: PrismaService;
let invitations: InvitationsService;
const password = 'Synthetic-pilot-password-123';

beforeAll(async () => {
  const adminUrl = process.env.UPGRADE_TEST_ADMIN_URL;
  if (!adminUrl || new URL(adminUrl).hostname !== '127.0.0.1') {
    throw new Error('ISOLATED_TEST_DATABASE_REQUIRED');
  }
  admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  dbName = `omnidesk_s16_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE DATABASE "${dbName}"`);
  const url = new URL(adminUrl);
  url.pathname = `/${dbName}`;
  process.env.DATABASE_URL = url.toString();
  process.env.JWT_ACCESS_SECRET = 'synthetic-s16-access-secret';
  process.env.JWT_REFRESH_SECRET = 'synthetic-s16-refresh-secret';
  process.env.META_APP_SECRET = 'synthetic-s16-meta-secret';
  await safeDeploy(resolve(__dirname, '..'));
  const module = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), AppModule],
  })
    .overrideProvider(WhatsappService)
    .useValue({
      sendTextMessage: jest.fn().mockResolvedValue({ messages: [{ id: 'synthetic-meta-id' }] }),
      sendMediaMessage: jest.fn().mockResolvedValue({ messages: [{ id: 'synthetic-media-id' }] }),
    })
    .compile();
  app = module.createNestApplication({ rawBody: true, logger: false });
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  prisma = app.get(PrismaService);
  invitations = app.get(InvitationsService);
});

afterAll(async () => {
  if (app) await app.close();
  if (admin) {
    if (dbName && /^omnidesk_s16_[a-f0-9]{32}$/.test(dbName)) {
      await admin.query(`DROP DATABASE "${dbName}" WITH (FORCE)`);
    }
    await admin.end();
  }
});

async function onboardClinic(label: string) {
  const email = `${randomUUID()}@example.invalid`;
  const invitation = await invitations.issue(email, 'synthetic-operator');
  await request(app.getHttpServer())
    .post('/auth/accept-invitation')
    .send({ token: invitation.token, password, firstName: 'Pilot', lastName: label })
    .expect(200);
  const login = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password })
    .expect(200);
  const created = await request(app.getHttpServer())
    .post('/organizations')
    .auth(login.body.access_token as string, { type: 'bearer' })
    .send({ name: `Synthetic ${label}`, slug: `pilot-${label}-${randomUUID()}` })
    .expect(201);
  const organizationId = created.body.organizationId as string;
  const token = created.body.access_token as string;
  expect(organizationId).toMatch(/^[a-f0-9-]{36}$/);
  const role = await system(() => prisma.role.findFirstOrThrow({
    where: { organizationId, name: 'Agent' },
  }));
  const staff = await system(async () => {
    const user = await prisma.user.create({
      data: { email: `${randomUUID()}@example.invalid`, password_hash: 'synthetic', firstName: 'Assigned', lastName: label, status: 'ACTIVE' },
    });
    await prisma.organizationMembership.create({
      data: { organizationId, userId: user.id, roleId: role.id, status: 'ACTIVE' },
    });
    return user;
  });
  const record = await system(async () => {
    const lead = await prisma.lead.create({
      data: { organizationId, firstName: 'Synthetic', lastName: 'Patient', phoneNumber: `1555${Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, '0')}`, country: 'US', timezone: 'UTC', primaryLanguage: 'en', assignedAgentId: staff.id },
    });
    const conversation = await prisma.conversation.create({
      data: { organizationId, leadId: lead.id, externalContactId: lead.phoneNumber, assignedAgentId: staff.id },
    });
    return { lead, conversation };
  });
  return { organizationId, token, staff, ...record };
}

it('onboards two clinics, assigns separate staff, and scopes their HTTP conversation views', async () => {
  const first = await onboardClinic('first');
  const second = await onboardClinic('second');
  expect(first.organizationId).not.toBe(second.organizationId);
  expect(first.staff.id).not.toBe(second.staff.id);
  expect(first.conversation.assignedAgentId).toBe(first.staff.id);
  expect(second.conversation.assignedAgentId).toBe(second.staff.id);
  const own = await request(app.getHttpServer())
    .get('/conversations')
    .auth(first.token, { type: 'bearer' })
    .expect(200);
  const ids = (own.body as { id: string }[]).map((row) => row.id);
  expect(ids).toContain(first.conversation.id);
  expect(ids).not.toContain(second.conversation.id);
  await request(app.getHttpServer())
    .get(`/conversations/${second.conversation.id}/messages`)
    .auth(first.token, { type: 'bearer' })
    .expect(404);
});
