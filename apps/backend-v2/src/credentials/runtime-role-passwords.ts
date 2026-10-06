import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';
import type { Client } from 'pg';

/**
 * Runtime DB role passwords come from deploy secrets, not SQL files (KI-013).
 *
 * The applied migration 20260930000000_least_privilege_roles created the roles with
 * literal passwords; applied migrations are forward-only, so the deploy CLI replaces
 * them on every `npm run db:deploy` from these secret env vars. The CLI sends a
 * SCRAM-SHA-256 verifier computed here, so the plaintext never reaches the server
 * (or its statement log) and is never printed.
 */
export const RUNTIME_ROLES = [
  { role: 'omnix_backend_runtime', env: 'OMNIX_BACKEND_RUNTIME_DB_PASSWORD' },
  { role: 'omnix_python_runtime', env: 'OMNIX_PYTHON_RUNTIME_DB_PASSWORD' },
] as const;

const SCRAM_ITERATIONS = 4096;
// Printable ASCII without quotes/backslash/space: no SASLprep surprises, no quoting issues.
const PASSWORD_PATTERN = /^[A-Za-z0-9!#$%&()*+,\-./:;<=>?@[\]^_{|}~]{32,128}$/;

/** PostgreSQL SCRAM-SHA-256 verifier (the format stored in pg_authid.rolpassword). */
export function scramSha256Verifier(
  password: string,
  salt = randomBytes(16),
): string {
  const salted = pbkdf2Sync(password, salt, SCRAM_ITERATIONS, 32, 'sha256');
  const clientKey = createHmac('sha256', salted).update('Client Key').digest();
  const storedKey = createHash('sha256').update(clientKey).digest();
  const serverKey = createHmac('sha256', salted).update('Server Key').digest();
  return `SCRAM-SHA-256$${SCRAM_ITERATIONS}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`;
}

export interface RuntimeRolePasswordResult {
  set: string[];
  missing: string[];
}

/**
 * Sets each runtime role's password from its env var. Missing values are reported;
 * with `required` (production) they stop the deploy so the committed literal
 * password can never survive there.
 */
export async function applyRuntimeRolePasswords(
  db: Client,
  env: NodeJS.ProcessEnv = process.env,
  required = env.NODE_ENV === 'production',
): Promise<RuntimeRolePasswordResult> {
  const result: RuntimeRolePasswordResult = { set: [], missing: [] };
  for (const { role, env: name } of RUNTIME_ROLES) {
    const password = env[name];
    if (!password) {
      result.missing.push(name);
      continue;
    }
    if (!PASSWORD_PATTERN.test(password)) {
      throw new Error('RUNTIME_ROLE_PASSWORD_INVALID');
    }
    const exists = await db.query(
      'SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = $1',
      [role],
    );
    if (!exists.rowCount) throw new Error('RUNTIME_ROLE_MISSING');
    // Role names are constants; the verifier is base64 + '$:' only, quoted by the driver.
    await db.query(
      `ALTER ROLE ${role} WITH PASSWORD ${db.escapeLiteral(scramSha256Verifier(password))}`,
    );
    result.set.push(role);
  }
  if (required && result.missing.length) {
    throw new Error('RUNTIME_ROLE_PASSWORD_REQUIRED');
  }
  return result;
}
