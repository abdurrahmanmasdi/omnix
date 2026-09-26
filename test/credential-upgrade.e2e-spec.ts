import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { Client } from 'pg';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { safeDeploy, deployMigrations } from '../src/credentials/deploy-cli';
import { credentialKey } from '../src/credentials/credential-cipher';
import { repairCredentials } from '../src/credentials/credential-upgrade';
import { CredentialsService } from '../src/credentials/credentials.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { AuthService } from '../src/auth/auth.service';
import { tenantStorage } from '../src/core/tenant/tenant.context';

jest.setTimeout(120_000);
const root = resolve(__dirname, '..');
const key = process.env.INTEGRATION_CREDENTIAL_KEY;
const databases: string[] = [];
let admin: Client;

beforeAll(async () => {
  const url = process.env.UPGRADE_TEST_ADMIN_URL;
  if (!url || new URL(url).hostname !== '127.0.0.1')
    throw new Error('ISOLATED_TEST_DATABASE_REQUIRED');
  admin = new Client({ connectionString: url });
  await admin.connect();
});

afterAll(async () => {
  if (!admin) return;
  for (const name of databases) {
    if (!/^omnidesk_s02_[a-f0-9]{32}$/.test(name))
      throw new Error('UNSAFE_TEST_DATABASE_NAME');
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  }
  await admin.end();
});

async function database(): Promise<Client> {
  const name = `omnidesk_s02_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE DATABASE "${name}"`);
  databases.push(name);
  const url = new URL(process.env.UPGRADE_TEST_ADMIN_URL!);
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.toString();
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  return db;
}

function assertSchemaMatches() {
  try {
    execFileSync(
      process.execPath,
      [
        resolve(root, 'node_modules/prisma/build/index.js'),
        'migrate',
        'diff',
        '--from-config-datasource',
        '--to-schema',
        'prisma/schema.prisma',
        '--exit-code',
      ],
      { cwd: root, env: process.env, stdio: 'pipe' },
    );
  } catch (error) {
    // Diff stdout contains schema structure only, never patient records or tokens.
    const result = error as { stdout?: Buffer };
    throw new Error(
      `Schema comparison failed: ${result.stdout?.toString() ?? 'CLI failure'}`,
    );
  }
}

async function legacyFixture(db: Client) {
  const organizationId = randomUUID();
  const userId = randomUUID();
  const channelId = randomUUID();
  const crmToken = randomBytes(24).toString('hex');
  const channelToken = randomBytes(24).toString('hex');
  await db.query(
    `INSERT INTO organizations (id, name, slug, "updatedAt", "crmAccessToken")
    VALUES ($1, 'Synthetic Clinic', $2, NOW(), $3)`,
    [organizationId, `clinic-${organizationId}`, crmToken],
  );
  await db.query(
    `INSERT INTO users (id, email, password_hash, "firstName", "lastName", "isEmailVerified")
    VALUES ($1, $2, $3, 'Synthetic', 'Operator', true)`,
    [
      userId,
      `${userId}@example.invalid`,
      await bcrypt.hash('Synthetic-password-123', 4),
    ],
  );
  await db.query(
    `INSERT INTO channels (id, "organizationId", provider, "providerAccountId", "accessToken", "updatedAt")
    VALUES ($1, $2, 'WHATSAPP_CLOUD_API', 'synthetic-account', $3, NOW())`,
    [channelId, organizationId, channelToken],
  );
  for (let index = 0; index < 2; index++) {
    await db.query(
      `INSERT INTO leads (id, "organizationId", "firstName", "lastName", "phoneNumber", country, timezone, "primaryLanguage", "updatedAt")
      VALUES ($1, $2, 'Synthetic', 'Patient', '+15550000001', 'US', 'UTC', 'en', NOW() + ($3 * INTERVAL '1 second'))`,
      [randomUUID(), organizationId, index],
    );
  }
  return { organizationId, userId, channelId, crmToken, channelToken };
}

async function verifyRuntime(
  db: Client,
  fixture: Awaited<ReturnType<typeof legacyFixture>>,
) {
  const prisma = new PrismaService();
  const config = new ConfigService({
    INTEGRATION_CREDENTIAL_KEY: key,
    JWT_ACCESS_SECRET: 'synthetic-access-secret',
    JWT_REFRESH_SECRET: 'synthetic-refresh-secret',
  });
  const credentials = new CredentialsService(
    prisma,
    config,
    new AuditService(prisma),
  );
  try {
    await tenantStorage.run({ isSystemBypass: true }, async () => {
      await credentials.onModuleInit();
      const channel = await prisma.channel.findUniqueOrThrow({
        where: { id: fixture.channelId },
      });
      const crm = await prisma.credential.findFirstOrThrow({
        where: { organizationId: fixture.organizationId, provider: 'HUBSPOT' },
      });
      expect(
        (await credentials.readActive(fixture.organizationId, crm.id))
          .accessToken === fixture.crmToken,
      ).toBe(true);
      expect(
        (
          await credentials.readActive(
            fixture.organizationId,
            channel.credentialId!,
          )
        ).accessToken === fixture.channelToken,
      ).toBe(true);
      expect(channel.accessToken).toBeNull();
      expect(
        await prisma.lead.count({
          where: { organizationId: fixture.organizationId },
        }),
      ).toBe(2);
      expect(
        await prisma.lead.count({
          where: { organizationId: fixture.organizationId, deletedAt: null },
        }),
      ).toBe(1);
      const auth = new AuthService(prisma, new JwtService(), config);
      const login = await auth.login({
        email: `${fixture.userId}@example.invalid`,
        password: 'Synthetic-password-123',
      });
      expect(typeof login.accessToken).toBe('string');
    });
    // Every runtime Prisma scalar column must exist, including new media/outbox fields.
    const columns = await db.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`,
    );
    const present = new Set(
      columns.rows.map((row) => `${row.table_name}.${row.column_name}`),
    );
    for (const model of Prisma.dmmf.datamodel.models) {
      for (const field of model.fields.filter(
        (field) => field.kind !== 'object',
      )) {
        expect(
          present.has(
            `${model.dbName ?? model.name}.${field.dbName ?? field.name}`,
          ),
        ).toBe(true);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

it('deploys an empty database and is restartable', async () => {
  const db = await database();
  try {
    expect(await safeDeploy(root)).toBe(0);
    expect(await safeDeploy(root)).toBe(0);
    expect((await db.query('SELECT * FROM credentials')).rowCount).toBe(0);
    expect((await db.query('SELECT * FROM outbox_events')).rowCount).toBe(0);
    assertSchemaMatches();
  } finally {
    await db.end();
  }
});

it('upgrades legacy tokens and duplicate leads before the unsafe historical migration', async () => {
  const db = await database();
  try {
    deployMigrations(root, '20260920140000_secure_credentials');
    const fixture = await legacyFixture(db);
    expect(await safeDeploy(root)).toBe(2);
    expect(await safeDeploy(root)).toBe(0);
    await verifyRuntime(db, fixture);
    assertSchemaMatches();
    expect(
      (
        await db.query(
          `SELECT count(*) FROM audit_logs WHERE action = 'credential.upgrade_verified'`,
        )
      ).rows[0].count,
    ).toBe('2');
    await expect(
      db.query(
        `INSERT INTO credentials (id, "organizationId", provider, "encryptedPayload", "updatedAt")
      VALUES ($1, $2, 'HUBSPOT', 'PLAINTEXT_MIGRATE:synthetic', NOW())`,
        [randomUUID(), fixture.organizationId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  } finally {
    await db.end();
  }
});

it('repairs already-applied prefix history, preserves sessions and verifies decryption through the real service', async () => {
  const db = await database();
  try {
    deployMigrations(root, '20260920140000_secure_credentials');
    const fixture = await legacyFixture(db);
    deployMigrations(root, '20260926112440_schema_sync');
    const sessionId = randomUUID();
    await db.query(
      `INSERT INTO sessions (id, "userId", "tokenHash", "familyId", "expiresAt")
      VALUES ($1, $2, 'synthetic-hash', 'synthetic-family', NOW() + INTERVAL '1 day')`,
      [sessionId, fixture.userId],
    );
    expect(await safeDeploy(root)).toBe(2);
    expect(
      (await db.query('SELECT id FROM sessions WHERE id = $1', [sessionId]))
        .rowCount,
    ).toBe(1);
    expect(
      (
        await db.query(
          `SELECT count(*) FROM credentials WHERE "encryptedPayload" LIKE 'PLAINTEXT_MIGRATE:%'`,
        )
      ).rows[0].count,
    ).toBe('0');
    await verifyRuntime(db, fixture);
  } finally {
    await db.end();
  }
});

it('rolls back encrypted writes and source cleanup together when audit persistence fails', async () => {
  const db = await database();
  try {
    deployMigrations(root, '20260920140000_secure_credentials');
    const fixture = await legacyFixture(db);
    await db.query(`CREATE FUNCTION reject_upgrade_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$;
      CREATE TRIGGER reject_upgrade BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_upgrade_audit()`);
    await expect(
      repairCredentials(db, credentialKey(key)),
    ).rejects.toBeDefined();
    expect((await db.query('SELECT * FROM credentials')).rowCount).toBe(0);
    expect(
      (
        await db.query(
          'SELECT "crmAccessToken" FROM organizations WHERE id = $1',
          [fixture.organizationId],
        )
      ).rows[0].crmAccessToken === fixture.crmToken,
    ).toBe(true);
    await db.query('DROP TRIGGER reject_upgrade ON audit_logs');
    expect(await safeDeploy(root)).toBe(2);
  } finally {
    await db.end();
  }
});

it('rejects missing and incorrect keys without changing stored credentials', async () => {
  const db = await database();
  try {
    delete process.env.INTEGRATION_CREDENTIAL_KEY;
    await expect(safeDeploy(root)).rejects.toThrow('CREDENTIAL_KEY_INVALID');
    expect(
      (
        await db.query(
          `SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'`,
        )
      ).rows[0].count,
    ).toBe('0');
    process.env.INTEGRATION_CREDENTIAL_KEY = key;
    deployMigrations(root, '20260920140000_secure_credentials');
    await legacyFixture(db);
    await safeDeploy(root);
    const before = (
      await db.query('SELECT "encryptedPayload" FROM credentials ORDER BY id')
    ).rows;
    process.env.INTEGRATION_CREDENTIAL_KEY = randomBytes(32).toString('base64');
    await expect(safeDeploy(root)).rejects.toThrow('CREDENTIAL_DECRYPT_FAILED');
    const after = (
      await db.query('SELECT "encryptedPayload" FROM credentials ORDER BY id')
    ).rows;
    expect(JSON.stringify(before) === JSON.stringify(after)).toBe(true);
  } finally {
    process.env.INTEGRATION_CREDENTIAL_KEY = key;
    await db.end();
  }
});
