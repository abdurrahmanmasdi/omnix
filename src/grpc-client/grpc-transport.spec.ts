import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { Logger } from '@nestjs/common';
import { GRPC_CONFIG } from '../config/grpc.constants';
import { grpcClientTransport } from './grpc-transport';

const configOf =
  (values: Record<string, string>) =>
  (name: string): string | undefined =>
    values[name];

describe('grpcClientTransport (KI-002)', () => {
  let dir: string;
  let cert: Buffer;
  let key: Buffer;

  beforeAll(() => {
    // Synthetic, test-only localhost certificate generated per run (never committed).
    dir = mkdtempSync(join(tmpdir(), 'omnix-grpc-tls-'));
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'ec',
        '-pkeyopt',
        'ec_paramgen_curve:prime256v1',
        '-nodes',
        '-days',
        '1',
        '-subj',
        '/CN=localhost',
        '-addext',
        'subjectAltName=DNS:localhost,IP:127.0.0.1',
        '-keyout',
        join(dir, 'server.key'),
        '-out',
        join(dir, 'server.pem'),
      ],
      { stdio: 'ignore' },
    );
    cert = readFileSync(join(dir, 'server.pem'));
    key = readFileSync(join(dir, 'server.key'));
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('requires a CA when TLS is required (the default)', () => {
    expect(() => grpcClientTransport(configOf({}))).toThrow(
      /INTERNAL_GRPC_TLS_CA/,
    );
  });

  it('refuses plaintext without the private-network acknowledgement', () => {
    expect(() =>
      grpcClientTransport(configOf({ INTERNAL_GRPC_TLS: 'disabled' })),
    ).toThrow(/INTERNAL_GRPC_PRIVATE_NETWORK/);
  });

  it('accepts the validated boolean acknowledgement from ConfigService', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const values: Record<string, unknown> = {
      INTERNAL_GRPC_TLS: 'disabled',
      INTERNAL_GRPC_PRIVATE_NETWORK: true,
    };
    expect(
      grpcClientTransport((name) => values[name]).credentials._isSecure(),
    ).toBe(false);
    warn.mockRestore();
  });

  it('allows acknowledged plaintext with a warning', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const transport = grpcClientTransport(
      configOf({
        INTERNAL_GRPC_TLS: 'disabled',
        INTERNAL_GRPC_PRIVATE_NETWORK: 'true',
      }),
    );
    expect(transport.credentials._isSecure()).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('INTERNAL_GRPC_TLS_DISABLED'),
    );
    warn.mockRestore();
  });

  it('rejects unreadable or non-PEM CA material', () => {
    expect(() =>
      grpcClientTransport(
        configOf({ INTERNAL_GRPC_TLS_CA: join(dir, 'missing.pem') }),
      ),
    ).toThrow(/INTERNAL_GRPC_TLS_CA/);
    expect(() =>
      grpcClientTransport(
        configOf({
          INTERNAL_GRPC_TLS_CA_B64: Buffer.from('nope').toString('base64'),
        }),
      ),
    ).toThrow(/PEM/);
  });

  it.each(['path', 'base64'])(
    'talks TLS to a server with the test certificate (%s)',
    async (encoding) => {
      const definition = grpc.loadPackageDefinition(
        protoLoader.loadSync(GRPC_CONFIG.PROTO_PATHS.AGENT),
      ) as unknown as {
        agent: { SalesAgent: grpc.ServiceClientConstructor };
      };
      const server = new grpc.Server();
      server.addService(definition.agent.SalesAgent.service, {
        GenerateReply: (_call: unknown, callback: grpc.sendUnaryData<object>) =>
          callback(null, { replyText: 'synthetic tls reply' }),
      });
      const port = await new Promise<number>((resolve, reject) =>
        server.bindAsync(
          '127.0.0.1:0',
          grpc.ServerCredentials.createSsl(
            null,
            [{ cert_chain: cert, private_key: key }],
            false,
          ),
          (error, bound) => (error ? reject(error) : resolve(bound)),
        ),
      );
      const call = (credentials: grpc.ChannelCredentials) =>
        new Promise<{ replyText: string }>((resolve, reject) => {
          const client = new definition.agent.SalesAgent(
            `localhost:${port}`,
            credentials,
          );
          (
            client as unknown as {
              GenerateReply: (
                request: object,
                options: { deadline: number },
                callback: (
                  error: Error | null,
                  reply: { replyText: string },
                ) => void,
              ) => void;
            }
          ).GenerateReply(
            {},
            { deadline: Date.now() + 5000 },
            (error, reply) => {
              client.close();
              if (error) reject(error);
              else resolve(reply);
            },
          );
        });
      try {
        const transport = grpcClientTransport(
          configOf(
            encoding === 'path'
              ? {
                  INTERNAL_GRPC_TLS: 'required',
                  INTERNAL_GRPC_TLS_CA: join(dir, 'server.pem'),
                }
              : { INTERNAL_GRPC_TLS_CA_B64: cert.toString('base64') },
          ),
        );
        await expect(call(transport.credentials)).resolves.toMatchObject({
          replyText: 'synthetic tls reply',
        });
        // A plaintext client cannot talk to the TLS port.
        await expect(
          call(grpc.credentials.createInsecure()),
        ).rejects.toMatchObject({
          code: grpc.status.UNAVAILABLE,
        });
      } finally {
        server.forceShutdown();
      }
    },
  );
});
