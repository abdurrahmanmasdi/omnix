import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { Client } from 'pg';
import { credentialKey } from './credential-cipher';
import { hasColumn, repairCredentials } from './credential-upgrade';
import { applyRuntimeRolePasswords } from './runtime-role-passwords';

const STAGED_THROUGH = '20260920140000_secure_credentials';

export function deployMigrations(root: string, through?: string): void {
  const migrations = join(root, 'prisma/migrations');
  const run = (config: string) => {
    try {
      execFileSync(
        process.execPath,
        [
          join(root, 'node_modules/prisma/build/index.js'),
          'migrate',
          'deploy',
          '--config',
          config,
        ],
        { cwd: root, stdio: 'pipe', env: process.env },
      );
    } catch (error: unknown) {
      const stderr = (error as { stderr?: Buffer }).stderr?.toString() ?? '';
      const code = stderr.match(/\bP\d{4}\b/)?.[0] ?? 'CLI';
      throw new Error(`MIGRATION_DEPLOY_FAILED_${code}`);
    }
  };
  if (!through) {
    run(join(root, 'prisma.config.ts'));
    return;
  }
  const staging = mkdtempSync(join(root, '.credential-deploy-'));
  try {
    mkdirSync(join(staging, 'migrations'));
    for (const entry of readdirSync(migrations, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name <= through) {
        cpSync(
          join(migrations, entry.name),
          join(staging, 'migrations', entry.name),
          { recursive: true },
        );
      }
    }
    const config = join(staging, 'prisma.config.ts');
    writeFileSync(
      config,
      `import { defineConfig } from 'prisma/config';\nexport default defineConfig({
      schema: ${JSON.stringify(join(root, 'prisma/schema.prisma'))},
      migrations: { path: ${JSON.stringify(join(staging, 'migrations'))} },
      datasource: { url: process.env.DATABASE_URL }
    });\n`,
    );
    run(config);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

export async function safeDeploy(
  root = resolve(process.cwd()),
): Promise<number> {
  // Validate BEFORE touching the database, even for a clean installation.
  const key = credentialKey(process.env.INTEGRATION_CREDENTIAL_KEY);
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    await db.query(
      `SELECT pg_advisory_lock(hashtext('omnidesk-safe-deploy-v1'))`,
    );
    if (await hasColumn(db, 'organizations', 'whatsappAccessToken')) {
      const legacy = await db.query<{ count: string }>(
        `SELECT count(*) FROM organizations WHERE COALESCE("whatsappAccessToken", '') <> '' OR COALESCE("whatsappPhoneNumberId", '') <> ''`,
      );
      if (legacy.rows[0].count !== '0')
        throw new Error('PRE_MVP_WHATSAPP_MIGRATION_REQUIRES_OPERATOR');
    }
    if (!(await hasColumn(db, 'credentials', 'encryptedPayload'))) {
      deployMigrations(root, STAGED_THROUGH);
    }
    const repaired = await repairCredentials(db, key);
    deployMigrations(root);
    await repairCredentials(db, key);
    // KI-013: runtime role passwords from secrets, replacing the migration's literals.
    const roles = await applyRuntimeRolePasswords(db);
    for (const name of roles.missing) {
      console.warn(
        `RUNTIME_ROLE_PASSWORD_NOT_SET ${name}: role keeps its previous password`,
      );
    }
    return repaired;
  } finally {
    await db.end(); // Releases the session deployment lock on success and failure.
  }
}

if (require.main === module) {
  safeDeploy()
    .then((repaired) => {
      console.log(`CREDENTIAL_UPGRADE_COMPLETE repaired=${repaired}`);
    })
    .catch((error: unknown) => {
      // pg/Prisma errors can contain queries/parameters; never print raw errors.
      const message = error instanceof Error ? error.message : '';
      const safeCodes = new Set([
        'DATABASE_URL_REQUIRED',
        'CREDENTIAL_KEY_INVALID',
        'CREDENTIAL_DECRYPT_FAILED',
        'CREDENTIAL_KEY_VERSION_UNSUPPORTED',
        'CREDENTIAL_LEGACY_TOKEN_EMPTY',
        'CREDENTIAL_VERIFY_FAILED',
        'CREDENTIAL_CRM_CONFLICT_REQUIRES_OPERATOR',
        'CREDENTIAL_CHANNEL_LINK_INVALID',
        'CREDENTIAL_CHANNEL_CONFLICT_REQUIRES_OPERATOR',
        'CREDENTIAL_CHANNEL_VERIFY_FAILED',
        'PRE_MVP_WHATSAPP_MIGRATION_REQUIRES_OPERATOR',
        'RUNTIME_ROLE_PASSWORD_REQUIRED',
        'RUNTIME_ROLE_PASSWORD_INVALID',
        'RUNTIME_ROLE_MISSING',
      ]);
      const code =
        safeCodes.has(message) ||
        /^MIGRATION_DEPLOY_FAILED_(P\d{4}|CLI)$/.test(message)
          ? message
          : 'CREDENTIAL_UPGRADE_FAILED';
      console.error(
        `${code}: deployment stopped; see docs/CREDENTIAL_UPGRADE.md`,
      );
      process.exitCode = 1;
    });
}
