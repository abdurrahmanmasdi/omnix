import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import request from 'supertest';
import { safeDeploy } from '../src/credentials/deploy-cli';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

// KI-033: liveness, readiness and metrics endpoints.
jest.setTimeout(120_000);
let admin: Client;
let dbName: string;
let app: INestApplication;
// Fake AI service with the same bearer check as Python's AuthInterceptor; the
// accepted secret can be changed to simulate a wrong INTERNAL_RPC_SECRET.
let aiServer: grpc.Server;
let acceptedSecret = '';

async function startFakeAiService(): Promise<string> {
  const definition = protoLoader.loadSync(
    resolve(__dirname, '../src/proto/agent.proto'),
  );
  const pkg = grpc.loadPackageDefinition(definition) as unknown as {
    agent: { SalesAgent: { service: grpc.ServiceDefinition } };
  };
  aiServer = new grpc.Server();
  aiServer.addService(pkg.agent.SalesAgent.service, {
    Ping: (call: grpc.ServerUnaryCall<unknown, unknown>, callback: any) => {
      const token = call.metadata.get('authorization')[0];
      if (token !== `Bearer ${acceptedSecret}`)
        return callback({ code: grpc.status.UNAUTHENTICATED });
      callback(null, {});
    },
  });
  const port = await new Promise<number>((done, fail) =>
    aiServer.bindAsync(
      '127.0.0.1:0',
      grpc.ServerCredentials.createInsecure(),
      (error, bound) => (error ? fail(error) : done(bound)),
    ),
  );
  return `127.0.0.1:${port}`;
}

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
  acceptedSecret = process.env.INTERNAL_RPC_SECRET ?? '';
  process.env.PYTHON_SERVER_URL = await startFakeAiService();
  // Imported after the env is set: the config module snapshots process.env.
  const { AppModule } =
    jest.requireActual<typeof import('../src/app.module')>('../src/app.module');
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = module.createNestApplication({ logger: false });
  await app.init();
});

afterAll(async () => {
  if (app) await app.close();
  aiServer?.forceShutdown();
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

  it('GET /ready is ready when the AI service accepts the RPC secret (KI-083)', async () => {
    await request(app.getHttpServer() as Server)
      .get('/ready')
      .expect(200, {
        status: 'ready',
        checks: { database: 'ok', redis: 'ok', grpc: 'ok' },
      });
  });

  it('GET /ready is 503 naming grpc when the RPC secret is refused (KI-083)', async () => {
    acceptedSecret = 'a-different-secret';
    try {
      const response = await request(app.getHttpServer() as Server)
        .get('/ready')
        .expect(503);
      expect(response.body).toEqual({
        status: 'not_ready',
        checks: { database: 'ok', redis: 'ok', grpc: 'failed' },
      });
    } finally {
      acceptedSecret = process.env.INTERNAL_RPC_SECRET ?? '';
    }
  });

  it('GET /ready is 503 naming grpc when the AI service is down', async () => {
    aiServer.forceShutdown();
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
