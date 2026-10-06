import axios from 'axios';
import {
  CoexistenceSyncService,
  COEXISTENCE_FIELDS,
} from './coexistence-sync.service';
import { EmbeddedSignupService } from './embedded-signup.service';
import { CredentialsService } from '../credentials/credentials.service';
import { decryptCredential } from '../credentials/credential-cipher';

jest.mock('axios');
describe('Embedded Signup (synthetic Meta assets)', () => {
  const syntheticToken = 'synthetic-business-token';
  const key = Buffer.alloc(32, 7);
  let service: EmbeddedSignupService;
  let channels: any[];
  let encrypted: any[];
  let prisma: any;
  beforeEach(() => {
    jest.resetAllMocks();
    channels = [];
    encrypted = [];
    prisma = {
      channel: {
        findMany: jest.fn(async () => channels),
        findFirstOrThrow: jest.fn(async () => channels[0]),
        create: jest.fn(async ({ data }) => {
          const c = { id: 'channel-1', ...data };
          channels.push(c);
          return c;
        }),
        update: jest.fn(async ({ data }) => Object.assign(channels[0], data)),
      },
      credential: {
        create: jest.fn(async ({ data }) => {
          const c = { id: `credential-${encrypted.length}`, ...data };
          encrypted.push(c);
          return c;
        }),
        updateMany: jest.fn(),
      },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn(async (fn) => fn(prisma)),
    };
    const values: Record<string, string> = {
      META_APP_ID: '100',
      META_EMBEDDED_SIGNUP_CONFIG_ID: '200',
      META_APP_SECRET: 'synthetic-app-secret',
      INTEGRATION_CREDENTIAL_KEY: key.toString('base64'),
      META_GRAPH_API_VERSION: 'v25.0',
    };
    const config = { get: (name: string) => values[name] };
    const credentials = new CredentialsService(
      prisma,
      config as never,
      {} as never,
    );
    service = new EmbeddedSignupService(
      prisma,
      credentials,
      config as never,
      new CoexistenceSyncService(prisma, config as never),
    );
    (axios.get as jest.Mock).mockImplementation(async (url: string) => {
      if (url.endsWith('/oauth/access_token'))
        return { data: { access_token: syntheticToken } };
      if (url.endsWith('/debug_token'))
        return {
          data: {
            data: {
              app_id: '100',
              is_valid: true,
              granular_scopes: [
                { scope: 'whatsapp_business_management', target_ids: ['300'] },
              ],
            },
          },
        };
      if (url.endsWith('/subscriptions'))
        return {
          data: {
            data: [
              {
                object: 'whatsapp_business_account',
                fields: COEXISTENCE_FIELDS.map((name) => ({ name })),
              },
            ],
          },
        };
      return {
        data: {
          data: [
            { id: '400', is_on_biz_app: true, platform_type: 'CLOUD_API' },
          ],
        },
      };
    });
    (axios.post as jest.Mock).mockResolvedValue({
      data: { success: true, request_id: 'synthetic-sync-request' },
    });
  });
  it('repeat onboarding retains one channel and encrypted credentials with required subscriptions', async () => {
    await service.connect('org-a', 'synthetic-code');
    await service.connect('org-a', 'synthetic-code-2');
    expect(channels).toHaveLength(1);
    expect(
      (axios.post as jest.Mock).mock.calls.filter((call) =>
        call[0].endsWith('/smb_app_data'),
      ),
    ).toHaveLength(2);
    expect(encrypted[0].encryptedPayload).not.toContain(syntheticToken);
    expect(decryptCredential(encrypted[0].encryptedPayload, key)).toMatchObject(
      { accessToken: syntheticToken, phoneNumberId: '400' },
    );
    expect(
      JSON.stringify(await service.connect('org-a', 'synthetic-code-3')),
    ).not.toContain(syntheticToken);
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/300/subscribed_apps'),
      {},
      expect.anything(),
    );
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/400/smb_app_data'),
      { messaging_product: 'whatsapp', sync_type: 'history' },
      expect.anything(),
    );
  });
  it('rejects another tenant owning the number without persisting or subscribing', async () => {
    channels.push({ organizationId: 'org-b' });
    await expect(service.connect('org-a', 'synthetic-code')).rejects.toThrow(
      'already connected',
    );
    expect(encrypted).toHaveLength(0);
    expect(axios.post).not.toHaveBeenCalled();
  });
  it('sanitizes provider errors without creating a channel', async () => {
    (axios.get as jest.Mock).mockRejectedValue({
      config: { params: { access_token: syntheticToken } },
    });
    await expect(service.connect('org-a', 'synthetic-code')).rejects.toThrow(
      'Meta signup could not be completed',
    );
    expect(channels).toHaveLength(0);
  });
  it('keeps the saved connection and reports subscription outages', async () => {
    (axios.post as jest.Mock).mockRejectedValue(new Error('synthetic outage'));
    expect(await service.connect('org-a', 'synthetic-code')).toMatchObject({
      subscriptionState: 'ERROR',
      historySyncState: 'PENDING',
    });
    expect(channels).toHaveLength(1);
  });
});
