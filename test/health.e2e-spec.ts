import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { safeDeploy } from '../src/credentials/deploy-cli';

// KI-033: liveness, readiness and metrics endpoints.
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
  dbName = 'omnidesk_health_' + randomUUID().replace(/-/g, '');
  await admin.query(`CREATE DATABASE "${dbName}"`);
  const testUrl = new URL(url);
  testUrl.pathname = `/${dbName}`;
  process.env.DATABASE_URL = testUrl.toString();
  await safeDeploy(resolve(__dirname, '..'));
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = module.createNestApplication({ logger: false });
  await app.init();
});

afterAll(async () => {
  if (app) await app.close();
  if (admin) {
    await admin.query(`DROP DATABASE "${dbName}" WITH (FORCE)`);
    await admin.end();
  }
});

describe('health endpoints (KI-033)', () => {
  it('GET /health is a dependency-free liveness probe', async () => {
    await request(app.getHttpServer() as Server)
      .get('/health')
      .expect(200, { status: 'ok' });
  });

  it('GET /ready reports each dependency; no AI service here, so 503 with grpc failed', async () => {
    const response = await request(app.getHttpServer() as Server)
      .get('/ready')
      .expect(503);
    expect(response.body).toEqual({
      status: 'not_ready',
      checks: { database: 'ok', redis: 'ok', grpc: 'failed' },
    });
  });

  it('GET /metrics is served outside production', async () => {
    const response = await request(app.getHttpServer() as Server)
      .get('/metrics')
      .expect(200);
    expect(response.text).toContain('process_cpu_user_seconds_total');
  });
});
