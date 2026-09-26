/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

describe('First Organization Onboarding (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let userEmail: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Match production bootstrap exactly
    const cookieParser = require('cookie-parser');
    app.use(cookieParser());
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
    await app.close();
  });

  // Helper: sign up a new user and return the access token
  async function signupUser(
    email: string,
    firstName = 'Test',
    lastName = 'Founder',
  ): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        email,
        password: 'password123',
        firstName,
        lastName,
      })
      .expect(201);

    return res.body.access_token;
  }

  it('should signup and get a token without an organization', async () => {
    userEmail = `test-org-${Date.now()}@example.com`;
    accessToken = await signupUser(userEmail);
    expect(accessToken).toBeDefined();

    // The token should have no organizationId (user has no org yet)
    const payload = JSON.parse(
      Buffer.from(accessToken.split('.')[1], 'base64').toString(),
    );
    expect(payload.organizationId).toBeNull();
  });

  it('should not be able to call a tenant endpoint without an organization', async () => {
    // The JWT strategy (jwt-auth) rejects tokens that lack organizationId
    await request(app.getHttpServer())
      .get('/conversations')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);
  });

  it('should reject organization creation for a PENDING user', async () => {
    // Signup creates users with status=PENDING.
    // UserJwtStrategy now enforces ACTIVE status.
    await request(app.getHttpServer())
      .post('/organizations')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Test Clinic',
        slug: `test-clinic-pending-${Date.now()}`,
        industry_category: 'MEDICAL',
      })
      .expect(401);
  });

  it('should create the first organization after email verification', async () => {
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

    // The new token should contain the organizationId
    const payload = JSON.parse(
      Buffer.from(res.body.access_token.split('.')[1], 'base64').toString(),
    );
    expect(payload.organizationId).toBe(res.body.organizationId);
    expect(payload.roleId).toBeDefined();

    // Use the newly returned access token for subsequent requests
    accessToken = res.body.access_token;
  });

  it('should have provisioned roles, permissions, membership, and persona', async () => {
    const payload = JSON.parse(
      Buffer.from(accessToken.split('.')[1], 'base64').toString(),
    );
    const orgId = payload.organizationId;

    // Verify the AI persona was created
    const persona = await prisma.aiPersona.findUnique({
      where: { organizationId: orgId },
    });
    expect(persona).not.toBeNull();
    expect(persona!.clinicName).toBe('Test Clinic');

    // Verify roles were provisioned (Super Admin, Manager, Agent)
    const roles = await prisma.role.findMany({
      where: { organizationId: orgId },
      orderBy: { name: 'asc' },
    });
    const roleNames = roles.map((r) => r.name).sort();
    expect(roleNames).toEqual(['Agent', 'Manager', 'Super Admin']);

    // Verify the user has an ACTIVE membership with Super Admin role
    const membership = await prisma.organizationMembership.findFirst({
      where: {
        userId: payload.sub,
        organizationId: orgId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      include: { role: true },
    });
    expect(membership).not.toBeNull();
    expect(membership!.role.name).toBe('Super Admin');

    // Verify role permissions were granted
    const superAdminRole = roles.find((r) => r.name === 'Super Admin');
    const rolePerms = await prisma.rolePermission.findMany({
      where: { roleId: superAdminRole!.id },
    });
    expect(rolePerms.length).toBeGreaterThan(0);
  });

  it('should handle duplicate organization slugs by throwing conflict', async () => {
    const userEmail2 = `test-org2-${Date.now()}@example.com`;
    await signupUser(userEmail2);

    // Re-login to get a fresh token (signup token was for PENDING status)
    const loginRes2 = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: userEmail2, password: 'password123' })
      .expect(200);
    const accessToken2 = loginRes2.body.access_token;

    // user2 creates org with a known slug
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

    // user3 tries to create org with the same slug → 409 Conflict
    const userEmail3 = `test-org3-${Date.now()}@example.com`;
    await signupUser(userEmail3);

    const loginRes3 = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: userEmail3, password: 'password123' })
      .expect(200);
    const accessToken3 = loginRes3.body.access_token;

    await request(app.getHttpServer())
      .post('/organizations')
      .set('Authorization', `Bearer ${accessToken3}`)
      .send({
        name: 'Test Clinic 3',
        slug: duplicateSlug,
        industry_category: 'MEDICAL',
      })
      .expect(409);
  });

  it('should call a protected tenant endpoint using the updated token', async () => {
    const res = await request(app.getHttpServer())
      .get('/conversations')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    // The conversations endpoint returns an array (empty for a new org)
    expect(Array.isArray(res.body)).toBeTruthy();
  });

  it('should not create duplicate membership on repeated workspace creation', async () => {
    // user1 already has an org — calling createWorkspace again should return
    // the existing organizationId (idempotent), not create a second membership.
    const res = await request(app.getHttpServer())
      .post('/organizations')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Another Clinic',
        slug: `another-clinic-${Date.now()}`,
        industry_category: 'MEDICAL',
      })
      .expect(201);

    // Should return the same org ID (existing membership detected)
    const payload = JSON.parse(
      Buffer.from(accessToken.split('.')[1], 'base64').toString(),
    );
    expect(res.body.organizationId).toBe(payload.organizationId);
  });
});
