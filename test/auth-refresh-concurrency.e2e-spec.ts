/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth Refresh & Multi-Org (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let userEmail: string;
  let accessToken: string;
  let refreshToken: string;
  let userId: string;

  let org1Id: string;
  let org2Id: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    userEmail = `test-refresh-${Date.now()}@example.com`;
  });

  afterAll(async () => {
    // Cleanup
    if (userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }
    if (org1Id) {
      await prisma.organization
        .delete({ where: { id: org1Id } })
        .catch(() => {});
    }
    if (org2Id) {
      await prisma.organization
        .delete({ where: { id: org2Id } })
        .catch(() => {});
    }
    await app.close();
  });

  it('1. should signup a new user', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        email: userEmail,
        password: 'password123',
        firstName: 'Test',
        lastName: 'Refresh',
      })
      .expect(201);

    expect(res.body.access_token).toBeDefined();

    const user = await prisma.user.findUnique({ where: { email: userEmail } });
    expect(user).toBeDefined();
    expect(user!.status).toBe('ACTIVE');
    userId = user!.id;
  });

  it('2. should login and get tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: userEmail, password: 'password123' })
      .expect(200);

    accessToken = res.body.access_token;
    refreshToken = res.body.refresh_token;
    expect(accessToken).toBeDefined();
    expect(refreshToken).toBeDefined();
  });

  it('3. should create two organizations for the user', async () => {
    // Org 1
    const res1 = await request(app.getHttpServer())
      .post('/organizations')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Refresh Org 1',
        slug: `refresh-org-1-${Date.now()}`,
      })
      .expect(201);
    org1Id = res1.body.organizationId;
    expect(org1Id).toBeDefined();

    // Org 2
    const res2 = await request(app.getHttpServer())
      .post('/organizations')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Refresh Org 2',
        slug: `refresh-org-2-${Date.now()}`,
      })
      .expect(201);
    org2Id = res2.body.organizationId;
    expect(org2Id).toBeDefined();
  });

  it('4. should refresh token with multi-org concurrency', async () => {
    // Attempt multiple concurrent refresh token requests
    const refreshRequests = [
      request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refresh_token: refreshToken, organizationId: org1Id }),
      request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refresh_token: refreshToken, organizationId: org2Id }),
      request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refresh_token: refreshToken, organizationId: org1Id }),
    ];

    const results = await Promise.all(refreshRequests);

    // Auth controller should handle concurrency without throwing 500s or crashing
    // Depending on refresh token rotation logic, the first might succeed and others fail (if strict rotation),
    // or all might succeed if within a grace period.
    const successes = results.filter((r) => r.status === 200);
    expect(successes.length).toBeGreaterThan(0);

    // At least one request should yield an access token bounded to an organization
    const successfulRes = successes[0];
    expect(successfulRes.body.access_token).toBeDefined();

    // The new access token should have the organizationId payload
    const token = successfulRes.body.access_token as string;
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64').toString(),
    );
    expect(payload.organizationId).toBeDefined();
    expect([org1Id, org2Id]).toContain(payload.organizationId);
  });
});
