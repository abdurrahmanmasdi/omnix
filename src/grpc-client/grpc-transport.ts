import { readFileSync } from 'node:fs';
import { Logger } from '@nestjs/common';
import { ChannelCredentials, credentials } from '@grpc/grpc-js';

/**
 * Transport security for the internal Nest -> Python gRPC link (KI-002).
 *
 * One switch, named the same in both services: INTERNAL_GRPC_TLS=required|disabled.
 * - required (default): trust the CA from INTERNAL_GRPC_TLS_CA (file path) or
 *   INTERNAL_GRPC_TLS_CA_B64 (base64 PEM); INTERNAL_GRPC_TLS_SERVER_NAME optionally
 *   overrides the name checked against the server certificate. Missing or
 *   unreadable material stops startup (fail closed).
 * - disabled: plaintext, only with INTERNAL_GRPC_PRIVATE_NETWORK=true as an explicit
 *   acknowledgement that the link is on a private network; logs a warning.
 * Which mode each deployment uses is decided in P1-11.
 */
export interface GrpcClientTransport {
  credentials: ChannelCredentials;
  channelOptions: Record<string, string>;
}

// Raw env strings or values from the validated config (which may be booleans).
type ConfigLookup = (name: string) => unknown;

const read = (get: ConfigLookup, name: string): string | undefined => {
  const value = get(name);
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'boolean' || typeof value === 'number')
    return `${value}`;
  return undefined;
};

const logger = new Logger('GrpcTransport');

function caMaterial(get: ConfigLookup): Buffer {
  const path = read(get, 'INTERNAL_GRPC_TLS_CA');
  const encoded = read(get, 'INTERNAL_GRPC_TLS_CA_B64');
  if (path && encoded) {
    throw new Error(
      'Set either INTERNAL_GRPC_TLS_CA or INTERNAL_GRPC_TLS_CA_B64, not both',
    );
  }
  let pem: Buffer;
  if (path) {
    try {
      pem = readFileSync(path);
    } catch {
      throw new Error('INTERNAL_GRPC_TLS_CA file cannot be read');
    }
  } else if (encoded) {
    pem = Buffer.from(encoded, 'base64');
  } else {
    throw new Error(
      'INTERNAL_GRPC_TLS=required needs INTERNAL_GRPC_TLS_CA or INTERNAL_GRPC_TLS_CA_B64',
    );
  }
  if (!pem.toString('utf8').includes('-----BEGIN CERTIFICATE-----')) {
    throw new Error('INTERNAL_GRPC_TLS_CA must be a PEM certificate');
  }
  return pem;
}

/** Problems with the transport settings, for startup validation (names only). */
export function grpcTransportProblems(get: ConfigLookup): string[] {
  const mode = read(get, 'INTERNAL_GRPC_TLS') || 'required';
  if (mode !== 'required' && mode !== 'disabled') {
    return ['INTERNAL_GRPC_TLS must be required or disabled'];
  }
  const ack = read(get, 'INTERNAL_GRPC_PRIVATE_NETWORK');
  if (ack !== undefined && ack !== '' && ack !== 'true' && ack !== 'false') {
    return ['INTERNAL_GRPC_PRIVATE_NETWORK must be true or false'];
  }
  if (mode === 'disabled') {
    return ack === 'true'
      ? []
      : [
          'INTERNAL_GRPC_TLS=disabled requires INTERNAL_GRPC_PRIVATE_NETWORK=true',
        ];
  }
  try {
    caMaterial(get);
    return [];
  } catch (error) {
    return [(error as Error).message];
  }
}

export function grpcClientTransport(get: ConfigLookup): GrpcClientTransport {
  const [problem] = grpcTransportProblems(get);
  if (problem) throw new Error(problem);
  if ((read(get, 'INTERNAL_GRPC_TLS') || 'required') === 'disabled') {
    logger.warn(
      'INTERNAL_GRPC_TLS_DISABLED: internal gRPC is plaintext; only acceptable on a private network',
    );
    return { credentials: credentials.createInsecure(), channelOptions: {} };
  }
  const serverName = read(get, 'INTERNAL_GRPC_TLS_SERVER_NAME');
  return {
    credentials: credentials.createSsl(caMaterial(get)),
    channelOptions: serverName
      ? { 'grpc.ssl_target_name_override': serverName }
      : {},
  };
}
