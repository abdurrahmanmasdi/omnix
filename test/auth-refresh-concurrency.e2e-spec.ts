import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { InvitationsService } from '../src/auth/invitations.service';
import cookieParser from 'cookie-parser';
import { tenantStorage } from '../src/core/tenant/tenant.context';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { safeDeploy } from '../src/credentials/deploy-cli';
import { resolve } from 'node:path';
import { ConfigModule } from '@nestjs/config';

function setCookies(headers: Record<string, unknown>): string[] {
  const value = headers['set-cookie'];
  return Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
}

function refreshCookie(headers: Record<string, unknown>): string {
  const cookie = setCookies(headers).find((value) => value.startsWith('refresh_token='));
  if (!cookie) throw new Error('REFRESH_COOKIE_MISSING');
  return cookie;
}

describe('Auth Refresh & Multi-Org (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let invitations: InvitationsService;

  let userEmail: string;
  let accessToken: string;
  let refreshTokenCookie: string;
  let userId: string;

  let org1Id: string;
  let org2Id: string;

  const password = 'password123';
  const operator = 'synthetic-operator';


  let admin: Client;
  let dbName: string;
  const root = resolve(__dirname, '..');

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

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), AppModule],
    }).compile();


    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    await app.init();

    prisma = app.get(PrismaService);
    invitations = app.get(InvitationsService);

    userEmail = `test-refresh-${Date.now()}@example.com`;
  });

  afterAll(async () => {
    await app.close();
    if (admin) {
      if (dbName && /^omnidesk_s03_[a-f0-9]{32}$/.test(dbName))
        await admin.query(`DROP DATABASE "${dbName}" WITH (FORCE)`);
      await admin.end();
    }
  });

  it('1. should activate a new user via invitation', async () => {
    const invite = await invitations.issue(userEmail, operator);

    await request(app.getHttpServer())
      .post('/auth/accept-invitation')
      .send({
        token: invite.token,
        password,
        firstName: 'Test',
        lastName: 'Refresh',
      })
      .expect(200);

    const user = await prisma.user.findUnique({ where: { email: userEmail } });
    expect(user).toBeDefined();
    expect(user!.status).toBe('ACTIVE');
    userId = user!.id;
  });

  it('2. should login and get tokens via cookie', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: userEmail, password })
      .expect(200);

    accessToken = res.body.access_token;

    refreshTokenCookie = refreshCookie(res.headers);
    expect(accessToken).toBeDefined();
    expect(refreshTokenCookie).toBeDefined();
  });

  it('3. should create two organizations directly for the user', async () => {
    await tenantStorage.run({ isSystemBypass: true }, async () => {
      // Org 1
      const org1 = await prisma.organization.create({
        data: {
          name: 'Refresh Org 1',
          slug: `refresh-org-1-${Date.now()}`,
        }
      });
      org1Id = org1.id;

      const role1 = await prisma.role.create({
        data: {
          organization: { connect: { id: org1Id } },
          name: 'Admin',
          is_system: true,
        }
      });

      await prisma.organizationMembership.create({
        data: {
          user: { connect: { id: userId } },
          organization: { connect: { id: org1Id } },
          role: { connect: { id: role1.id } },
          status: 'ACTIVE',
        }
      });

      // Org 2
      const org2 = await prisma.organization.create({
        data: {
          name: 'Refresh Org 2',
          slug: `refresh-org-2-${Date.now()}`,
        }
      });
      org2Id = org2.id;

      const role2 = await prisma.role.create({
        data: {
          organization: { connect: { id: org2Id } },
          name: 'Admin',
          is_system: true,
        }
      });

      await prisma.organizationMembership.create({
        data: {
          user: { connect: { id: userId } },
          organization: { connect: { id: org2Id } },
          role: { connect: { id: role2.id } },
          status: 'ACTIVE',
        }
      });
    });

    expect(org1Id).toBeDefined();
    expect(org2Id).toBeDefined();
  });

  it('4. should refresh token with multi-org concurrency and keep selected organization stable', async () => {
    // Attempt multiple concurrent refresh token requests
    const refreshRequests = [
      request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', refreshTokenCookie)
        .send({ organizationId: org1Id }),
      request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', refreshTokenCookie)
        .send({ organizationId: org2Id }),
      request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', refreshTokenCookie)
        .send({ organizationId: org1Id }),
    ];

    const results = await Promise.all(refreshRequests);

    const successes = results.filter((r) => r.status === 200);
    expect(successes.length).toBe(1);

    const successfulRes = successes[0];
    expect(successfulRes.body.access_token).toBeDefined();

    // The new access token should have the organizationId payload
    const token = successfulRes.body.access_token as string;
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64').toString(),
    );
    expect(payload.organizationId).toBeDefined();
    expect([org1Id, org2Id]).toContain(payload.organizationId);

    // Save the new cookie to verify replay revokes the family
    const newRefreshTokenCookie = refreshCookie(successfulRes.headers);
    expect(newRefreshTokenCookie).toBeDefined();

    // Now verify replay of the old token revokes the family
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', refreshTokenCookie)
      .send()
      .expect(401);

    // Verify the newly issued token is also revoked because the family was compromised
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', newRefreshTokenCookie)
      .send()
      .expect(401);
  });

  it('5. should lose access if membership is suspended', async () => {
    // Relogin to get fresh token
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: userEmail, password })
      .expect(200);
    const validRefreshTokenCookie = refreshCookie(res.headers);

    // Suspend user
    await prisma.user.update({
      where: { id: userId },
      data: { status: 'SUSPENDED' },
    });

    // Refresh should fail
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', validRefreshTokenCookie)
      .send()
      .expect(401);
  });
});
