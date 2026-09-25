import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('First Organization Onboarding (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  let userEmail: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    const cookieParser = require('cookie-parser');
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should signup and get a token without an organization', async () => {
    userEmail = `test-org-${Date.now()}@example.com`;
    const res = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        email: userEmail,
        password: 'password123',
        firstName: 'Test',
        lastName: 'Founder',
      })
      .expect(201);

    accessToken = res.body.access_token;
    expect(accessToken).toBeDefined();

    // The user status was set to ACTIVE in our backfilled migration, but standard signup sets it to PENDING unless verified. Wait, our signup sets it to PENDING. Let's verify email to make it ACTIVE if needed, but the current endpoints might just check JWT validity.
  });

  it('should not be able to call a tenant endpoint without an organization', async () => {
    // E.g., getting conversations should fail with 403 Forbidden since the JWT has no organizationId
    await request(app.getHttpServer())
      .get('/conversations')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);
  });

  it('should create the first organization successfully', async () => {
    const res = await request(app.getHttpServer())
      .post('/organizations')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Test Clinic',
        slug: `test-clinic-${Date.now()}`,
        industry_category: 'MEDICAL',
      })
      .expect(201);

    expect(res.body.organizationId).toBeDefined();
    expect(res.body.access_token).toBeDefined();

    // Use the newly returned access token
    accessToken = res.body.access_token;
  });

  it('should handle duplicate organization slugs by throwing conflict', async () => {
    // Signup user2
    const userEmail2 = `test-org2-${Date.now()}@example.com`;
    const res2 = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        email: userEmail2,
        password: 'password123',
        firstName: 'Test',
        lastName: 'Founder',
      })
      .expect(201);
    const accessToken2 = res2.body.access_token;

    // user2 creates org with duplicateSlug
    const duplicateSlug = `test-clinic-duplicate-${Date.now()}`;
    await request(app.getHttpServer())
      .post('/organizations')
      .set('Authorization', `Bearer ${accessToken2}`)
      .send({
        name: 'Test Clinic 2',
        slug: duplicateSlug,
        industry_category: 'MEDICAL',
      })
      .expect(201);

    // Signup user3
    const userEmail3 = `test-org3-${Date.now()}@example.com`;
    const res3 = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        email: userEmail3,
        password: 'password123',
        firstName: 'Test',
        lastName: 'Founder',
      })
      .expect(201);
    const accessToken3 = res3.body.access_token;

    // user3 tries to create org with same slug
    await request(app.getHttpServer())
      .post('/organizations')
      .set('Authorization', `Bearer ${accessToken3}`)
      .send({
        name: 'Test Clinic 3',
        slug: duplicateSlug,
        industry_category: 'MEDICAL',
      })
      .expect(409); // ConflictException
  });

  it('should call a protected tenant endpoint using the updated token', async () => {
    const res = await request(app.getHttpServer())
      .get('/conversations')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBeTruthy();
  });
});
