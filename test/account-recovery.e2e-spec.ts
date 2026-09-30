import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
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
let authService: AuthService;

beforeAll(async () => {
  const url = process.env.UPGRADE_TEST_ADMIN_URL;
  if (!url || new URL(url).hostname !== '127.0.0.1') throw new Error('ISOLATED_TEST_DATABASE_REQUIRED');
  admin = new Client({ connectionString: url });
  await admin.connect();
  dbName = 'omnidesk_recovery_' + randomUUID().replace(/-/g, '');
  await admin.query(`CREATE DATABASE "${dbName}"`);
  
  const testUrl = new URL(url);
  testUrl.pathname = '/' + dbName;
  process.env.DATABASE_URL = testUrl.toString();
  await safeDeploy(resolve(__dirname, '..'));

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleFixture.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  prisma = app.get(PrismaService);
  authService = app.get(AuthService);
});

afterAll(async () => {
  if (app) await app.close();
  if (admin) {
    await admin.query(`DROP DATABASE "${dbName}" WITH (FORCE)`);
    await admin.end();
  }
});

describe('Account Recovery (P1-08)', () => {
  let userId: string;
  let operatorId: string;
  let organizationId: string;
  
  beforeAll(async () => {
    organizationId = randomUUID();
    const hash = await bcrypt.hash('old-password', 10);
    userId = randomUUID();
    operatorId = randomUUID();
    
    await system(async () => {
      await prisma.organization.create({ data: { id: organizationId, name: 'Recovery Test Org', slug: 'recovery' } });
      await prisma.user.create({
        data: {
          id: userId,
          email: 'recover@example.com',
          firstName: 'R',
          lastName: 'U',
          password_hash: hash,
          status: 'ACTIVE'
        }
      });
      const roleId = randomUUID();
      await prisma.role.create({ data: { id: roleId, name: 'Admin' } });
      await prisma.organizationMembership.create({
        data: {
          userId,
          organizationId,
          roleId,
          status: 'ACTIVE'
        }
      });
      await prisma.session.create({
        data: {
          userId,
          tokenHash: 'somehash',
          familyId: 'family',
          expiresAt: new Date(Date.now() + 86400000)
        }
      });
    });
  });

  it('should issue a recovery token via AuthService', async () => {
    const result = await system(() => authService.issueRecovery('recover@example.com', operatorId));
    expect(result.token).toBeDefined();
    expect(result.token.length).toBeGreaterThan(16);
  });

  it('should successfully consume a recovery token, update password, and revoke sessions', async () => {
    const { token } = await system(() => authService.issueRecovery('recover@example.com', operatorId));
    
    const preSession = await system(() => prisma.session.findFirst({ where: { userId } }));
    expect(preSession?.isRevoked).toBe(false);

    const preUser = await system(() => prisma.user.findUnique({ where: { id: userId } }));
    const preSecurityVersion = preUser?.securityVersion;

    const response = await request(app.getHttpServer())
      .post('/auth/recovery/consume')
      .send({ token, newPassword: 'new-secure-password' });

    expect(response.status).toBe(204);

    const user = await system(() => prisma.user.findUnique({ where: { id: userId } }));
    const passwordMatch = await bcrypt.compare('new-secure-password', user!.password_hash);
    expect(passwordMatch).toBe(true);
    expect(user?.securityVersion).toBe(preSecurityVersion! + 1);

    const postSession = await system(() => prisma.session.findFirst({ where: { userId } }));
    expect(postSession?.isRevoked).toBe(true);

    const logs = await system(() => prisma.auditLog.findMany({ where: { organizationId } }));
    expect(logs.length).toBe(1);
    expect(logs[0].action).toBe('ACCOUNT_RECOVERY');
  });

  it('should fail if token is reused', async () => {
    const { token } = await system(() => authService.issueRecovery('recover@example.com', operatorId));
    await request(app.getHttpServer())
      .post('/auth/recovery/consume')
      .send({ token, newPassword: 'new-secure-password-2' });

    const response = await request(app.getHttpServer())
      .post('/auth/recovery/consume')
      .send({ token, newPassword: 'new-secure-password-3' });

    expect(response.status).toBe(401);
  });

  it('should fail if user is suspended', async () => {
    await system(() => prisma.user.update({ where: { id: userId }, data: { status: 'SUSPENDED' } }));
    
    await expect(
      system(() => authService.issueRecovery('recover@example.com', operatorId))
    ).rejects.toThrow();

    await system(() => prisma.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } }));
  });
});
