import { createHash, createHmac, pbkdf2Sync } from 'node:crypto';
import type { Client } from 'pg';
import {
  applyRuntimeRolePasswords,
  scramSha256Verifier,
} from './runtime-role-passwords';

const strong = (label: string) =>
  `synthetic-${label}-runtime-password-0123456789`;

const fakeDb = () => {
  const statements: string[] = [];
  const db = {
    statements,
    escapeLiteral: (value: string) => `'${value.replace(/'/g, "''")}'`,
    query: jest.fn((sql: string) => {
      statements.push(sql);
      return Promise.resolve({ rowCount: sql.startsWith('SELECT') ? 1 : 0 });
    }),
  };
  return db;
};

describe('runtime role passwords (KI-013)', () => {
  it('builds a PostgreSQL SCRAM-SHA-256 verifier', () => {
    const salt = Buffer.alloc(16, 7);
    const verifier = scramSha256Verifier('pencil', salt);
    const [, iterations, rest] = /^SCRAM-SHA-256\$(\d+):(.+)$/.exec(verifier)!;
    const [saltB64, keys] = rest.split('$');
    const [storedKey, serverKey] = keys.split(':');
    expect(iterations).toBe('4096');
    expect(Buffer.from(saltB64, 'base64')).toEqual(salt);
    const salted = pbkdf2Sync('pencil', salt, 4096, 32, 'sha256');
    const clientKey = createHmac('sha256', salted)
      .update('Client Key')
      .digest();
    expect(storedKey).toBe(
      createHash('sha256').update(clientKey).digest('base64'),
    );
    expect(serverKey).toBe(
      createHmac('sha256', salted).update('Server Key').digest('base64'),
    );
  });

  it('sets both roles from env and never sends or returns the plaintext', async () => {
    const db = fakeDb();
    const env = {
      OMNIX_BACKEND_RUNTIME_DB_PASSWORD: strong('backend'),
      OMNIX_PYTHON_RUNTIME_DB_PASSWORD: strong('python'),
    };
    const result = await applyRuntimeRolePasswords(
      db as unknown as Client,
      env,
      true,
    );
    expect(result).toEqual({
      set: ['omnix_backend_runtime', 'omnix_python_runtime'],
      missing: [],
    });
    const alters = db.statements.filter((sql) => sql.startsWith('ALTER ROLE'));
    expect(alters).toHaveLength(2);
    for (const sql of db.statements) {
      expect(sql).not.toContain(strong('backend'));
      expect(sql).not.toContain(strong('python'));
    }
    expect(alters[0]).toMatch(
      /^ALTER ROLE omnix_backend_runtime WITH PASSWORD 'SCRAM-SHA-256\$4096:/,
    );
  });

  it('only warns about missing passwords outside production', async () => {
    const db = fakeDb();
    await expect(
      applyRuntimeRolePasswords(db as unknown as Client, {}, false),
    ).resolves.toEqual({
      set: [],
      missing: [
        'OMNIX_BACKEND_RUNTIME_DB_PASSWORD',
        'OMNIX_PYTHON_RUNTIME_DB_PASSWORD',
      ],
    });
  });

  it('stops a production deploy without the passwords', async () => {
    await expect(
      applyRuntimeRolePasswords(fakeDb() as unknown as Client, {
        NODE_ENV: 'production',
      }),
    ).rejects.toThrow('RUNTIME_ROLE_PASSWORD_REQUIRED');
  });

  it('rejects weak passwords without echoing them', async () => {
    const promise = applyRuntimeRolePasswords(
      fakeDb() as unknown as Client,
      { OMNIX_BACKEND_RUNTIME_DB_PASSWORD: "short'pw" },
      false,
    );
    await expect(promise).rejects.toThrow(/^RUNTIME_ROLE_PASSWORD_INVALID$/);
  });
});
