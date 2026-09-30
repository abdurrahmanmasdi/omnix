import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { InvitationsService } from '../src/auth/invitations.service';
import * as bcrypt from 'bcrypt';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { safeDeploy } from '../src/credentials/deploy-cli';
import { tenantStorage } from '../src/core/tenant/tenant.context';

jest.setTimeout(120_000);
const system = <T>(fn: () => Promise<T>) =>
  tenantStorage.run({ isSystemBypass: true }, async () => await fn());
let admin: Client;
let dbName: string;
let app: INestApplication;
let prisma: PrismaService;
let invitations: InvitationsService;

beforeAll(async () => {
  const url = process.env.UPGRADE_TEST_ADMIN_URL;
  if (!url || new URL(url).hostname !== '127.0.0.1') throw new Error('ISOLATED_TEST_DATABASE_REQUIRED');
  admin = new Client({ connectionString: url });
  await admin.connect();
  dbName = 'omnidesk_s02_' + randomUUID().replace(/-/g, '');
  await admin.query(`CREATE DATABASE "${dbName}"`);
  
  const parsed = new URL(url);
  parsed.pathname = `/${dbName}`;
  const isolatedUrl = parsed.toString();
  process.env.DATABASE_URL = isolatedUrl;
  
  await safeDeploy(resolve(__dirname, '..'));

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleFixture.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  await app.init();
  
  prisma = app.get(PrismaService);
  invitations = app.get(InvitationsService);
});

afterAll(async () => {
  if (app) await app.close();
  if (!admin) return;
  await admin.query(`DROP DATABASE "${dbName}" WITH (FORCE)`);
  await admin.end();
});

describe('Clinic Invitations (e2e)', () => {
  it('should allow clinic owner to issue and new user to accept invitation', async () => {
    return system(async () => {
      // 1. Create a clinic and owner
      const owner = await prisma.user.create({
        data: {
          email: `owner-${Date.now()}@test.com`,
          password_hash: await bcrypt.hash('password123', 10),
          firstName: 'Owner',
          lastName: 'Test',
          status: 'ACTIVE',
        },
      });

      const org = await prisma.organization.create({
        data: {
          name: 'Test Clinic',
          slug: `test-clinic-${Date.now()}`,
        },
      });

      const role = await prisma.role.create({
        data: {
          name: 'Agent',
          organizationId: org.id,
        },
      });

      await prisma.organizationMembership.create({
        data: {
          userId: owner.id,
          organizationId: org.id,
          roleId: role.id,
        },
      });

      // 2. Issue invitation
      const newEmail = `staff-${Date.now()}@test.com`;
      const issueResult = await invitations.issueClinicInvitation(
        { email: newEmail, roleId: role.id },
        owner.id,
        org.id
      );

      expect(issueResult.token).toBeDefined();

      // 3. Accept via HTTP as a new user
      const acceptRes = await request(app.getHttpServer())
        .post('/auth/invitations/clinic/accept')
        .send({
          token: issueResult.token,
          firstName: 'Staff',
          lastName: 'Test',
          password: 'securepassword123',
        })
        .expect(200);

      expect(acceptRes.body.message).toEqual('Clinic invitation accepted.');
      expect(acceptRes.body.organizationId).toEqual(org.id);

      // 4. Verify user was created and joined clinic
      const staff = await prisma.user.findUnique({ where: { email: newEmail } });
      expect(staff).toBeDefined();
      expect(staff!.status).toEqual('ACTIVE');
      expect(staff!.firstName).toEqual('Staff');

      const membership = await prisma.organizationMembership.findUnique({
        where: { userId_organizationId: { userId: staff!.id, organizationId: org.id } },
      });
      expect(membership).toBeDefined();
      expect(membership!.roleId).toEqual(role.id);
    });
  });

  it('should allow existing user to accept clinic invitation with JWT', async () => {
    return system(async () => {
      // 1. Create a clinic and owner
      const owner = await prisma.user.create({
        data: {
          email: `owner2-${Date.now()}@test.com`,
          password_hash: await bcrypt.hash('password123', 10),
          firstName: 'Owner2',
          lastName: 'Test',
          status: 'ACTIVE',
        },
      });

      const org = await prisma.organization.create({
        data: {
          name: 'Test Clinic 2',
          slug: `test-clinic-2-${Date.now()}`,
        },
      });

      const role = await prisma.role.create({
        data: {
          name: 'Agent',
          organizationId: org.id,
        },
      });

      await prisma.organizationMembership.create({
        data: {
          userId: owner.id,
          organizationId: org.id,
          roleId: role.id,
        },
      });

      // 2. Create existing active user with another clinic
      const org3 = await prisma.organization.create({
        data: { name: 'Test Clinic 3', slug: `test-clinic-3-${Date.now()}` },
      });
      const role3 = await prisma.role.create({
        data: { name: 'Agent', organizationId: org3.id },
      });
      const existingUserEmail = `existing-${Date.now()}@test.com`;
      const existingUser = await prisma.user.create({
        data: {
          email: existingUserEmail,
          password_hash: await bcrypt.hash('password123', 10),
          firstName: 'Existing',
          lastName: 'User',
          status: 'ACTIVE',
        },
      });
      const existingMembership = await prisma.organizationMembership.create({
        data: {
          userId: existingUser.id,
          organizationId: org3.id,
          roleId: role3.id,
          status: 'ACTIVE'
        },
      });

      // 3. Issue invitation
      const issueResult = await invitations.issueClinicInvitation(
        { email: existingUserEmail, roleId: role.id },
        owner.id,
        org.id
      );

      // 4. Generate JWT for existing user
      const jwtService = app.get(require('@nestjs/jwt').JwtService);
      const token = jwtService.sign(
        { sub: existingUser.id, email: existingUserEmail, organizationId: org3.id, roleId: role3.id },
        { secret: process.env.JWT_ACCESS_SECRET }
      );

      // 5. Accept via HTTP as an existing logged-in user
      const acceptRes = await request(app.getHttpServer())
        .post('/auth/invitations/clinic/accept')
        .set('Authorization', `Bearer ${token}`)
        .send({
          token: issueResult.token,
        });
      
      if (acceptRes.status !== 200) {
        console.error(acceptRes.body);
      }
      expect(acceptRes.status).toEqual(200);
      expect(acceptRes.body.message).toEqual('Clinic invitation accepted.');

      // 6. Verify user joined clinic
      const membership = await prisma.organizationMembership.findUnique({
        where: { userId_organizationId: { userId: existingUser.id, organizationId: org.id } },
      });
      expect(membership).toBeDefined();
      expect(membership!.roleId).toEqual(role.id);
    });
  });
});
