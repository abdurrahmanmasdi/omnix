import { credentialKey } from '../credentials/credential-cipher';
import { grpcTransportProblems } from '../grpc-client/grpc-transport';

/**
 * Startup configuration schema (KI-028). Passed to ConfigModule.forRoot({ validate }),
 * so a missing or invalid variable stops the process before it serves anything.
 * Error messages name variables, never their values. Names are listed in .env.example.
 */
export type NodeEnv = 'development' | 'test' | 'production';

export interface AppEnv {
  NODE_ENV: NodeEnv;
  PORT: number;
  DATABASE_URL?: string;
  RUNTIME_DATABASE_URL?: string;
  REDIS_URL: string;
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
  JWT_ACCESS_EXPIRATION: string;
  JWT_REFRESH_EXPIRATION: string;
  META_APP_SECRET: string;
  META_VERIFY_TOKEN: string;
  INTERNAL_RPC_SECRET: string;
  INTEGRATION_CREDENTIAL_KEY: string;
  FRONTEND_URL: string;
  PYTHON_SERVER_URL: string;
  INTERNAL_GRPC_TLS: 'required' | 'disabled';
  INTERNAL_GRPC_PRIVATE_NETWORK: boolean;
  INTERNAL_GRPC_TLS_CA?: string;
  INTERNAL_GRPC_TLS_CA_B64?: string;
  INTERNAL_GRPC_TLS_SERVER_NAME?: string;
  PATIENT_MEDIA_RETENTION_DAYS?: number;
  METRICS_TOKEN?: string;
}

const NODE_ENVS: NodeEnv[] = ['development', 'test', 'production'];
const DEV_FRONTEND_URL = 'http://localhost:3001';
const DEV_PYTHON_SERVER_URL = 'localhost:50051';
const MAX_ACCESS_SECONDS = 24 * 60 * 60;
const MAX_REFRESH_SECONDS = 90 * 24 * 60 * 60;
const UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

/** Seconds for a jsonwebtoken `expiresIn` value ("900", "15m", "7d"); null when unusable. */
export function expirationSeconds(raw: string): number | null {
  const match = /^(\d+)([smhd])?$/.exec(raw.trim());
  if (!match) return null;
  const seconds = Number(match[1]) * (match[2] ? UNIT_SECONDS[match[2]] : 1);
  return seconds > 0 ? seconds : null;
}

const hasProtocol = (raw: string, protocols: string[]) => {
  try {
    return protocols.includes(new URL(raw).protocol);
  } catch {
    return false;
  }
};

export function validateEnv(raw: Record<string, unknown>): AppEnv {
  const problems: string[] = [];
  const text = (name: string): string | undefined => {
    const value = raw[name];
    return typeof value === 'string' && value.trim() !== ''
      ? value.trim()
      : undefined;
  };
  const required = (name: string): string => {
    const value = text(name);
    if (value === undefined) problems.push(`${name} is required`);
    return value ?? '';
  };

  const nodeEnvRaw = text('NODE_ENV') ?? 'development';
  if (!NODE_ENVS.includes(nodeEnvRaw as NodeEnv))
    problems.push(`NODE_ENV must be one of ${NODE_ENVS.join(', ')}`);
  const NODE_ENV = nodeEnvRaw as NodeEnv;
  const production = NODE_ENV === 'production';
  const minSecret = production ? 32 : 16;

  const portRaw = text('PORT');
  const PORT = portRaw === undefined ? 3001 : Number(portRaw);
  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535)
    problems.push('PORT must be an integer between 1 and 65535');

  const DATABASE_URL = text('DATABASE_URL');
  const RUNTIME_DATABASE_URL = text('RUNTIME_DATABASE_URL');
  if (!DATABASE_URL && !RUNTIME_DATABASE_URL)
    problems.push('DATABASE_URL or RUNTIME_DATABASE_URL is required');
  for (const [name, value] of [
    ['DATABASE_URL', DATABASE_URL],
    ['RUNTIME_DATABASE_URL', RUNTIME_DATABASE_URL],
  ] as const) {
    if (value && !hasProtocol(value, ['postgres:', 'postgresql:']))
      problems.push(`${name} must be a postgres:// or postgresql:// URL`);
  }

  const REDIS_URL = required('REDIS_URL');
  if (REDIS_URL && !hasProtocol(REDIS_URL, ['redis:', 'rediss:']))
    problems.push('REDIS_URL must be a redis:// or rediss:// URL');

  const JWT_ACCESS_SECRET = required('JWT_ACCESS_SECRET');
  const JWT_REFRESH_SECRET = required('JWT_REFRESH_SECRET');
  for (const [name, value] of [
    ['JWT_ACCESS_SECRET', JWT_ACCESS_SECRET],
    ['JWT_REFRESH_SECRET', JWT_REFRESH_SECRET],
  ] as const) {
    if (value && value.length < minSecret)
      problems.push(`${name} must be at least ${minSecret} characters`);
  }
  if (JWT_ACCESS_SECRET && JWT_ACCESS_SECRET === JWT_REFRESH_SECRET)
    problems.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ');

  // Unset expirations used to issue tokens that never expire.
  const JWT_ACCESS_EXPIRATION = required('JWT_ACCESS_EXPIRATION');
  const JWT_REFRESH_EXPIRATION = required('JWT_REFRESH_EXPIRATION');
  for (const [name, value, max] of [
    ['JWT_ACCESS_EXPIRATION', JWT_ACCESS_EXPIRATION, MAX_ACCESS_SECONDS],
    ['JWT_REFRESH_EXPIRATION', JWT_REFRESH_EXPIRATION, MAX_REFRESH_SECONDS],
  ] as const) {
    if (!value) continue;
    const seconds = expirationSeconds(value);
    if (seconds === null || seconds > max)
      problems.push(
        `${name} must be a positive duration like 900, 15m, 12h or 7d (at most ${max / 86400} days)`,
      );
  }

  const META_APP_SECRET = required('META_APP_SECRET');
  const META_VERIFY_TOKEN = required('META_VERIFY_TOKEN');
  const INTERNAL_RPC_SECRET = required('INTERNAL_RPC_SECRET');
  if (INTERNAL_RPC_SECRET && INTERNAL_RPC_SECRET.length < minSecret)
    problems.push(
      `INTERNAL_RPC_SECRET must be at least ${minSecret} characters`,
    );

  const INTEGRATION_CREDENTIAL_KEY = required('INTEGRATION_CREDENTIAL_KEY');
  if (INTEGRATION_CREDENTIAL_KEY) {
    try {
      credentialKey(INTEGRATION_CREDENTIAL_KEY);
    } catch {
      problems.push('INTEGRATION_CREDENTIAL_KEY must be a 32-byte base64 key');
    }
  }

  const FRONTEND_URL = production
    ? required('FRONTEND_URL')
    : (text('FRONTEND_URL') ?? DEV_FRONTEND_URL);
  if (
    FRONTEND_URL &&
    !FRONTEND_URL.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
      .every((origin) => hasProtocol(origin, ['http:', 'https:']))
  )
    problems.push(
      'FRONTEND_URL must be a comma-separated list of http(s) origins',
    );

  const PYTHON_SERVER_URL = production
    ? required('PYTHON_SERVER_URL')
    : (text('PYTHON_SERVER_URL') ?? DEV_PYTHON_SERVER_URL);
  if (PYTHON_SERVER_URL && !/^[A-Za-z0-9.-]+:\d{1,5}$/.test(PYTHON_SERVER_URL))
    problems.push('PYTHON_SERVER_URL must be host:port (no scheme)');

  // Same switch as the Python service; required (default) needs a CA (KI-002).
  problems.push(...grpcTransportProblems(text));
  const INTERNAL_GRPC_TLS =
    text('INTERNAL_GRPC_TLS') === 'disabled' ? 'disabled' : 'required';

  // Optional: without it /metrics is disabled in production (KI-033).
  const METRICS_TOKEN = text('METRICS_TOKEN');
  if (METRICS_TOKEN && METRICS_TOKEN.length < 32)
    problems.push('METRICS_TOKEN must be at least 32 characters');

  const retentionRaw = text('PATIENT_MEDIA_RETENTION_DAYS');
  const PATIENT_MEDIA_RETENTION_DAYS =
    retentionRaw === undefined ? undefined : Number(retentionRaw);
  if (
    PATIENT_MEDIA_RETENTION_DAYS !== undefined &&
    !(
      Number.isInteger(PATIENT_MEDIA_RETENTION_DAYS) &&
      PATIENT_MEDIA_RETENTION_DAYS > 0 &&
      PATIENT_MEDIA_RETENTION_DAYS <= 3650
    )
  )
    problems.push(
      'PATIENT_MEDIA_RETENTION_DAYS must be an integer from 1 to 3650',
    );

  if (problems.length) {
    throw new Error(
      [
        'Invalid configuration — fix these environment variables:',
        ...problems,
      ].join('\n'),
    );
  }

  return {
    NODE_ENV,
    PORT,
    DATABASE_URL,
    RUNTIME_DATABASE_URL,
    REDIS_URL,
    JWT_ACCESS_SECRET,
    JWT_REFRESH_SECRET,
    JWT_ACCESS_EXPIRATION,
    JWT_REFRESH_EXPIRATION,
    META_APP_SECRET,
    META_VERIFY_TOKEN,
    INTERNAL_RPC_SECRET,
    INTEGRATION_CREDENTIAL_KEY,
    FRONTEND_URL,
    PYTHON_SERVER_URL,
    INTERNAL_GRPC_TLS,
    INTERNAL_GRPC_PRIVATE_NETWORK:
      text('INTERNAL_GRPC_PRIVATE_NETWORK') === 'true',
    INTERNAL_GRPC_TLS_CA: text('INTERNAL_GRPC_TLS_CA'),
    INTERNAL_GRPC_TLS_CA_B64: text('INTERNAL_GRPC_TLS_CA_B64'),
    INTERNAL_GRPC_TLS_SERVER_NAME: text('INTERNAL_GRPC_TLS_SERVER_NAME'),
    PATIENT_MEDIA_RETENTION_DAYS,
    METRICS_TOKEN,
  };
}
