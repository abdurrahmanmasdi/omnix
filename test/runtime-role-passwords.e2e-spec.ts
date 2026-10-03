import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { safeDeploy } from '../src/credentials/deploy-cli';

// KI-013: the deploy step sets runtime role passwords from secret env vars.
jest.setTimeout(180_000);
let admin: Client;
let dbName: string;
let adminUrl: URL;
const saved = {
  backend: process.env.OMNIX_BACKEND_RUNTIME_DB_PASSWORD,
  python: process.env.OMNIX_PYTHON_RUNTIME_DB_PASSWORD,
};
const synthetic = () => `synthetic-${randomBytes(24).toString('hex')}`;

const canLogin = async (user: string, password: string) => {
  const client = new Client({
    host: adminUrl.hostname,
    port: Number(adminUrl.port),
    database: dbName,
    user,
    password,
  });
  try {
    await client.connect();
    await client.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
};

beforeAll(async () => {
  const url = process.env.UPGRADE_TEST_ADMIN_URL;
  if (!url || new URL(url).hostname !== '127.0.0.1')
    throw new Error('ISOLATED_TEST_DATABASE_REQUIRED');
  adminUrl = new URL(url);
  admin = new Client({ connectionString: url });
  await admin.connect();
  dbName = 'omnidesk_roles_' + randomUUID().replace(/-/g, '');
  await admin.query(`CREATE DATABASE "${dbName}"`);
  const testUrl = new URL(url);
  testUrl.pathname = `/${dbName}`;
  process.env.DATABASE_URL = testUrl.toString();
});

afterAll(async () => {
  process.env.OMNIX_BACKEND_RUNTIME_DB_PASSWORD = saved.backend;
  process.env.OMNIX_PYTHON_RUNTIME_DB_PASSWORD = saved.python;
  if (admin) {
    await admin.query(`DROP DATABASE "${dbName}" WITH (FORCE)`);
    await admin.end();
  }
});

describe('runtime role passwords from deploy secrets (KI-013)', () => {
  it('a fresh deploy sets both runtime role passwords from env, and a redeploy rotates them', async () => {
    const first = { backend: synthetic(), python: synthetic() };
    process.env.OMNIX_BACKEND_RUNTIME_DB_PASSWORD = first.backend;
    process.env.OMNIX_PYTHON_RUNTIME_DB_PASSWORD = first.python;
    await safeDeploy(resolve(__dirname, '..'));
    expect(await canLogin('omnix_backend_runtime', first.backend)).toBe(true);
    expect(await canLogin('omnix_python_runtime', first.python)).toBe(true);

    const stored = await admin.query<{ rolpassword: string }>(
      `SELECT rolpassword FROM pg_authid WHERE rolname = 'omnix_backend_runtime'`,
    );
    expect(stored.rows[0].rolpassword).toMatch(/^SCRAM-SHA-256\$4096:/);

    const second = { backend: synthetic(), python: synthetic() };
    process.env.OMNIX_BACKEND_RUNTIME_DB_PASSWORD = second.backend;
    process.env.OMNIX_PYTHON_RUNTIME_DB_PASSWORD = second.python;
    await safeDeploy(resolve(__dirname, '..'));
    expect(await canLogin('omnix_backend_runtime', first.backend)).toBe(false);
    expect(await canLogin('omnix_backend_runtime', second.backend)).toBe(true);
    expect(await canLogin('omnix_python_runtime', second.python)).toBe(true);
  });

  it('a production deploy without the secrets stops', async () => {
    delete process.env.OMNIX_BACKEND_RUNTIME_DB_PASSWORD;
    delete process.env.OMNIX_PYTHON_RUNTIME_DB_PASSWORD;
    const nodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await expect(safeDeploy(resolve(__dirname, '..'))).rejects.toThrow(
        'RUNTIME_ROLE_PASSWORD_REQUIRED',
      );
    } finally {
      process.env.NODE_ENV = nodeEnv;
    }
  });
});
