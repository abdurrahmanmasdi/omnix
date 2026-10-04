import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { deployMigrations } from './deploy-cli';

jest.mock('node:child_process', () => ({ execFileSync: jest.fn() }));

describe('staged migrations in a read-only application directory', () => {
  const run = jest.mocked(execFileSync);
  const through = '20260920140000_secure_credentials';
  let root: string;
  let staging: string | undefined;

  beforeEach(() => {
    run.mockReset();
    staging = undefined;
    root = mkdtempSync(join(tmpdir(), 'omnix-deploy-test-'));
    for (const name of [through, '20260926160000_credential_repair_guard']) {
      mkdirSync(join(root, 'prisma/migrations', name), { recursive: true });
      writeFileSync(
        join(root, 'prisma/migrations', name, 'migration.sql'),
        '-- synthetic fixture\n',
      );
    }
    writeFileSync(
      join(root, 'prisma/migrations/migration_lock.toml'),
      'provider = "postgresql"\n',
    );
    writeFileSync(join(root, 'prisma/schema.prisma'), '// synthetic fixture\n');
    symlinkSync(
      join(process.cwd(), 'node_modules'),
      join(root, 'node_modules'),
      'dir',
    );
    // Match the non-root Docker runtime: application files are not writable.
    chmodSync(root, 0o555);
  });

  afterEach(() => {
    chmodSync(root, 0o755);
    rmSync(root, { recursive: true, force: true });
    if (staging) rmSync(staging, { recursive: true, force: true });
  });

  it('stages unchanged migration files outside the application and resolves Prisma there', () => {
    run.mockImplementation((_file, args) => {
      const configPath = args![args!.indexOf('--config') + 1];
      staging = dirname(configPath);
      expect(staging.startsWith(root)).toBe(false);
      const config = readFileSync(configPath, 'utf8');
      expect(config).toContain(
        JSON.stringify(require.resolve('prisma/config')),
      );
      expect(config).toContain(
        JSON.stringify(join(root, 'prisma/schema.prisma')),
      );
      expect(config).toContain('url: process.env.DATABASE_URL');
      expect(
        readFileSync(
          join(staging, 'migrations', through, 'migration.sql'),
          'utf8',
        ),
      ).toBe('-- synthetic fixture\n');
      expect(
        readFileSync(join(staging, 'migrations/migration_lock.toml'), 'utf8'),
      ).toBe('provider = "postgresql"\n');
      expect(
        existsSync(
          join(staging, 'migrations/20260926160000_credential_repair_guard'),
        ),
      ).toBe(false);
      return Buffer.alloc(0);
    });

    deployMigrations(root, through);

    expect(run).toHaveBeenCalledTimes(1);
    expect(staging).toBeDefined();
    expect(existsSync(staging!)).toBe(false);
  });

  it('removes temporary files after a failed migration and only exposes its fixed code', () => {
    run.mockImplementation((_file, args) => {
      staging = dirname(args![args!.indexOf('--config') + 1]);
      throw Object.assign(new Error('synthetic-secret-must-not-escape'), {
        stderr: Buffer.from('P1001 synthetic-secret-must-not-escape'),
      });
    });

    expect(() => deployMigrations(root, through)).toThrow(
      /^MIGRATION_DEPLOY_FAILED_P1001$/,
    );
    expect(staging).toBeDefined();
    expect(existsSync(staging!)).toBe(false);
  });
});
