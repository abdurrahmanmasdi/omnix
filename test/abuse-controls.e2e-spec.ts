import type { Server } from 'node:http';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { safeDeploy } from '../src/credentials/deploy-cli';
import cookieParser from 'cookie-parser';

jest.setTimeout(120_000);
let admin: Client;
let dbName: string;
let app: INestApplication;

beforeAll(async () => {
  const url = process.env.UPGRADE_TEST_ADMIN_URL;
  if (!url || new URL(url).hostname !== '127.0.0.1')
    throw new Error('ISOLATED_TEST_DATABASE_REQUIRED');
  admin = new Client({ connectionString: url });
  await admin.connect();
  dbName = 'omnidesk_abuse_' + randomUUID().replace(/-/g, '');
  await admin.query(`CREATE DATABASE "${dbName}"`);

  const testUrl = new URL(url);
  testUrl.pathname = '/' + dbName;
  process.env.DATABASE_URL = testUrl.toString();
  await safeDeploy(resolve(__dirname, '..'));

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleFixture.createNestApplication();
  app.use(cookieParser()); // as in main.ts
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
});

afterAll(async () => {
  if (app) await app.close();
  if (admin) {
    await admin.query(`DROP DATABASE "${dbName}" WITH (FORCE)`);
    await admin.end();
  }
});

describe('Abuse Controls & Browser Protections (P1-09)', () => {
  it('should reject state-changing requests with a forbidden Origin', async () => {
    const response = await request(app.getHttpServer() as Server)
      .post('/auth/login')
      .set('Origin', 'http://malicious.com')
      .send({ email: 'test@example.com', password: 'password' });

    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/CSRF.*failed/i);
  });

  it('should allow state-changing requests with an allowed Origin', async () => {
    const response = await request(app.getHttpServer() as Server)
      .post('/auth/login')
      .set('Origin', 'http://localhost:3001')
      .send({ email: 'nonexistent@example.com', password: 'password' });

    // Assuming normal login fail, but NOT 403 CSRF
    expect(response.status).toBe(401);
  });

  it('should apply rate limiting to auth routes', async () => {
    // Auth endpoints have limit: 10 per 60000ms.
    // Let's send 11 requests sequentially to avoid supertest/Express port connection resets.
    let tooManyCount = 0;
    for (let i = 0; i < 11; i++) {
      const response = await request(app.getHttpServer() as Server)
        .post('/auth/login')
        .send({ email: 'brute@example.com', password: 'pass' });
      if (response.status === 429) {
        tooManyCount++;
      }
    }

    expect(tooManyCount).toBeGreaterThanOrEqual(1); // At least the 11th request should be 429
  });

  it('gives refresh and me their own generous per-IP bucket (clinic NAT)', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 15; i++) {
      statuses.push(
        (
          await request(app.getHttpServer() as Server)
            .post('/auth/refresh')
            .send({})
        ).status,
      );
      statuses.push(
        (await request(app.getHttpServer() as Server).get('/auth/me')).status,
      );
    }
    expect(statuses).not.toContain(429);
    expect(new Set(statuses)).toEqual(new Set([401]));
  });

  it('caps logins per IP across different emails', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) {
      const response = await request(app.getHttpServer() as Server)
        .post('/auth/login')
        .send({ email: `spray-${i}@example.com`, password: 'password-spray' });
      statuses.push(response.status);
    }
    expect(statuses).toContain(429);
  });
});
