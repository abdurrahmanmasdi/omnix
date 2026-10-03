import { randomBytes } from 'node:crypto';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './env.validation';

const valid = () => ({
  NODE_ENV: 'production',
  PORT: '3000',
  DATABASE_URL: 'postgresql://admin:synthetic@db.internal:5432/omnix',
  RUNTIME_DATABASE_URL: 'postgresql://runtime:synthetic@db.internal:5432/omnix',
  REDIS_URL: 'redis://redis.internal:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  JWT_ACCESS_EXPIRATION: '15m',
  JWT_REFRESH_EXPIRATION: '7d',
  META_APP_SECRET: 'synthetic-meta-app-secret',
  META_VERIFY_TOKEN: 'synthetic-verify-token',
  INTERNAL_RPC_SECRET: 'c'.repeat(32),
  INTEGRATION_CREDENTIAL_KEY: randomBytes(32).toString('base64'),
  FRONTEND_URL: 'https://app.example.test',
  PYTHON_SERVER_URL: 'ai.internal:50051',
  INTERNAL_GRPC_TLS: 'required',
  INTERNAL_GRPC_TLS_CA_B64: Buffer.from(
    '-----BEGIN CERTIFICATE-----\nc3ludGhldGlj\n-----END CERTIFICATE-----\n',
  ).toString('base64'),
});

const problemsOf = (env: Record<string, unknown>) => {
  try {
    validateEnv(env);
    return [];
  } catch (error) {
    return (error as Error).message.split('\n').slice(1);
  }
};

describe('validateEnv', () => {
  it('accepts a complete production configuration', () => {
    expect(() => validateEnv(valid())).not.toThrow();
  });

  it.each([
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'JWT_ACCESS_EXPIRATION',
    'JWT_REFRESH_EXPIRATION',
    'META_APP_SECRET',
    'META_VERIFY_TOKEN',
    'INTERNAL_RPC_SECRET',
    'INTEGRATION_CREDENTIAL_KEY',
    'REDIS_URL',
    'FRONTEND_URL',
    'PYTHON_SERVER_URL',
  ])('fails fast when %s is missing', (name) => {
    const env: Record<string, unknown> = valid();
    delete env[name];
    expect(problemsOf(env).join('\n')).toContain(name);
  });

  it('requires a database URL', () => {
    const env: Record<string, unknown> = valid();
    delete env.DATABASE_URL;
    delete env.RUNTIME_DATABASE_URL;
    expect(problemsOf(env).join('\n')).toContain('DATABASE_URL');
  });

  it('never issues non-expiring or overlong tokens', () => {
    expect(
      problemsOf({ ...valid(), JWT_ACCESS_EXPIRATION: 'never' }),
    ).toHaveLength(1);
    expect(problemsOf({ ...valid(), JWT_ACCESS_EXPIRATION: '0' })).toHaveLength(
      1,
    );
    expect(
      problemsOf({ ...valid(), JWT_ACCESS_EXPIRATION: '30d' }),
    ).toHaveLength(1);
    expect(
      problemsOf({ ...valid(), JWT_REFRESH_EXPIRATION: '365d' }),
    ).toHaveLength(1);
    expect(problemsOf({ ...valid(), JWT_ACCESS_EXPIRATION: '900' })).toEqual(
      [],
    );
  });

  it('rejects weak or reused JWT secrets', () => {
    expect(problemsOf({ ...valid(), JWT_ACCESS_SECRET: 'short' })).toHaveLength(
      1,
    );
    expect(
      problemsOf({ ...valid(), JWT_REFRESH_SECRET: valid().JWT_ACCESS_SECRET }),
    ).toHaveLength(1);
  });

  it('rejects an INTEGRATION_CREDENTIAL_KEY that is not 32 bytes of base64', () => {
    expect(
      problemsOf({
        ...valid(),
        INTEGRATION_CREDENTIAL_KEY: randomBytes(16).toString('base64'),
      }),
    ).toHaveLength(1);
  });

  it('rejects malformed URLs', () => {
    expect(
      problemsOf({ ...valid(), REDIS_URL: 'localhost:6379' }),
    ).toHaveLength(1);
    expect(problemsOf({ ...valid(), DATABASE_URL: 'mysql://x' })).toHaveLength(
      1,
    );
    expect(problemsOf({ ...valid(), FRONTEND_URL: 'not a url' })).toHaveLength(
      1,
    );
    expect(
      problemsOf({ ...valid(), PYTHON_SERVER_URL: 'ai internal:50051' }),
    ).toHaveLength(1);
    expect(problemsOf({ ...valid(), PORT: '99999' })).toHaveLength(1);
    expect(problemsOf({ ...valid(), NODE_ENV: 'prod' })).toHaveLength(1);
  });

  it('accepts gRPC resolver targets for PYTHON_SERVER_URL', () => {
    expect(
      problemsOf({ ...valid(), PYTHON_SERVER_URL: 'dns:///ai.internal:50051' }),
    ).toEqual([]);
  });

  it('lets development fall back to local FRONTEND_URL and PYTHON_SERVER_URL', () => {
    const env: Record<string, unknown> = {
      ...valid(),
      NODE_ENV: 'development',
      INTERNAL_GRPC_TLS: 'disabled',
      INTERNAL_GRPC_PRIVATE_NETWORK: 'true',
    };
    delete env.FRONTEND_URL;
    delete env.PYTHON_SERVER_URL;
    expect(validateEnv(env)).toMatchObject({
      FRONTEND_URL: 'http://localhost:3001',
      PYTHON_SERVER_URL: 'localhost:50051',
    });
  });

  it('names variables but never echoes their values', () => {
    const secret = 'leaky-secret-value';
    const message = problemsOf({
      ...valid(),
      JWT_ACCESS_SECRET: secret,
      REDIS_URL: secret,
    }).join('\n');
    expect(message).toContain('JWT_ACCESS_SECRET');
    expect(message).not.toContain(secret);
  });

  it('rejects an invalid PATIENT_MEDIA_RETENTION_DAYS', () => {
    expect(
      problemsOf({ ...valid(), PATIENT_MEDIA_RETENTION_DAYS: 'thirty' }),
    ).toHaveLength(1);
    expect(
      problemsOf({ ...valid(), PATIENT_MEDIA_RETENTION_DAYS: '30' }),
    ).toEqual([]);
  });

  it('stops ConfigModule (and so the app) from starting on a missing variable', async () => {
    const saved = { ...process.env };
    try {
      delete process.env.JWT_ACCESS_EXPIRATION;
      await expect(
        ConfigModule.forRoot({ validate: validateEnv, ignoreEnvFile: true }),
      ).rejects.toThrow(/JWT_ACCESS_EXPIRATION is required/);
    } finally {
      process.env = saved;
    }
  });

  describe('internal gRPC transport (KI-002)', () => {
    it('requires a CA when TLS is required (the default)', () => {
      const env: Record<string, unknown> = valid();
      delete env.INTERNAL_GRPC_TLS;
      delete env.INTERNAL_GRPC_TLS_CA_B64;
      expect(problemsOf(env).join('\n')).toContain('INTERNAL_GRPC_TLS_CA');
    });

    it('allows plaintext only with the private-network acknowledgement, in any NODE_ENV', () => {
      const disabled = { ...valid(), INTERNAL_GRPC_TLS: 'disabled' };
      expect(problemsOf(disabled).join('\n')).toContain(
        'INTERNAL_GRPC_PRIVATE_NETWORK',
      );
      expect(problemsOf({ ...disabled, NODE_ENV: 'development' })).toHaveLength(
        1,
      );
      expect(
        problemsOf({ ...disabled, INTERNAL_GRPC_PRIVATE_NETWORK: 'true' }),
      ).toEqual([]);
    });

    it('rejects an unknown mode', () => {
      expect(
        problemsOf({ ...valid(), INTERNAL_GRPC_TLS: 'optional' }),
      ).toHaveLength(1);
    });
  });
});
