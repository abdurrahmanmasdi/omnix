/* eslint-disable @typescript-eslint/no-unsafe-argument -- Synthetic BullMQ job payloads exercise the processor boundary. */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { Client } from 'pg';
import { resolve } from 'path';
import { WhatsappService } from '../src/webhooks/whatsapp.service';
import { WhatsappMediaService } from '../src/webhooks/whatsapp-media.service';
import { randomUUID } from 'crypto';
import { tenantStorage } from '../src/core/tenant/tenant.context';
import { encryptCredential } from '../src/credentials/credential-cipher';
import { WebhooksProcessor } from '../src/webhooks/webhooks.processor';
import { safeDeploy } from '../src/credentials/deploy-cli';

describe('Media Consent (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dbName: string;
  let admin: Client;
  const root = resolve(__dirname, '..');

  beforeAll(async () => {
    const adminUrl = process.env.UPGRADE_TEST_ADMIN_URL;
    if (!adminUrl || new URL(adminUrl).hostname !== '127.0.0.1')
      throw new Error('ISOLATED_TEST_DATABASE_REQUIRED');
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    dbName = `omnidesk_s10_${randomUUID().replace(/-/g, '')}`;
    await admin.query(`CREATE DATABASE "${dbName}"`);
    const url = new URL(adminUrl);
    url.pathname = `/${dbName}`;
    process.env.DATABASE_URL = url.toString();
    process.env.META_APP_SECRET = 'test-secret';

    await safeDeploy(root);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(WhatsappService)
      .useValue({
        sendTextMessage: jest.fn().mockResolvedValue({
          messages: [{ id: 'synthetic-consent-prompt' }],
        }),
      })
      .overrideProvider(WhatsappMediaService)
      .useValue({
        downloadMediaAsBase64: jest.fn().mockResolvedValue('mockbase64'),
        cleanupExpiredMedia: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    await app.init();
    prisma = app.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    if (app) await app.close();
    if (admin) {
      if (dbName && /^omnidesk_s10_[a-f0-9]{32}$/.test(dbName)) {
        await admin.query(`DROP DATABASE "${dbName}" WITH (FORCE)`);
      }
      await admin.end();
    }
  });

  it('should pass media consent lifecycle', async () => {
    const orgId = randomUUID();
    await tenantStorage.run({ isSystemBypass: true }, async () => {
      await prisma.organization.create({
        data: {
          id: orgId,
          name: 'Test Org',
          slug: 'test-org',
        },
      });
      await prisma.credential.create({
        data: {
          id: '11111111-1111-1111-1111-111111111111',
          organizationId: orgId,
          provider: 'WHATSAPP_CLOUD_API',
          encryptedPayload: encryptCredential(
            { metaAccessToken: 'test-token' },
            Buffer.from(process.env.INTEGRATION_CREDENTIAL_KEY!, 'base64'),
          ),
        },
      });
      await prisma.channel.create({
        data: {
          id: '22222222-2222-2222-2222-222222222222',
          organizationId: orgId,
          provider: 'WHATSAPP_CLOUD_API',
          providerAccountId: '123456789',
          credentialId: '11111111-1111-1111-1111-111111111111',
          status: 'ACTIVE',
        },
      });
    });

    const processor = app.get(WebhooksProcessor);

    // 1. Send Image Without Consent
    const payload1 = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '123456789',
          changes: [
            {
              value: {
                metadata: {
                  display_phone_number: '123456789',
                  phone_number_id: '123456789',
                },
                contacts: [
                  { profile: { name: 'Test User' }, wa_id: '4915112345678' },
                ],
                messages: [
                  {
                    from: '4915112345678',
                    id: 'wamid.HBgLNDkxNTEyMzQ1Njc4OQQ',
                    timestamp: '1612345678',
                    type: 'image',
                    image: { id: 'img-1' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    await processor.process({ data: payload1 } as any);

    await tenantStorage.run({ isSystemBypass: true }, async () => {
      const msg = await prisma.message.findFirst({
        where: { metaMessageId: 'wamid.HBgLNDkxNTEyMzQ1Njc4OQQ' },
      });
      expect(msg).toBeDefined();
      expect(msg!.content).toContain('Awaiting consent');
      expect(msg!.mediaUrl).toBeNull();
    });

    // 2. Affirmative consent
    const payload2 = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '123456789',
          changes: [
            {
              value: {
                metadata: {
                  display_phone_number: '123456789',
                  phone_number_id: '123456789',
                },
                contacts: [
                  { profile: { name: 'Test User' }, wa_id: '4915112345678' },
                ],
                messages: [
                  {
                    from: '4915112345678',
                    id: 'wamid.consent',
                    timestamp: '1612345679',
                    type: 'text',
                    text: { body: 'I CONSENT' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    await processor.process({ data: payload2 } as any);

    await tenantStorage.run({ isSystemBypass: true }, async () => {
      const lead = await prisma.lead.findFirst({
        where: { phoneNumber: '4915112345678' },
      });
      expect(lead!.mediaConsentGranted).toBe(true);
      expect(lead!.mediaConsentResponseId).toBe('wamid.consent');
    });

    // 3. Image with consent
    const payload3 = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '123456789',
          changes: [
            {
              value: {
                metadata: {
                  display_phone_number: '123456789',
                  phone_number_id: '123456789',
                },
                contacts: [
                  { profile: { name: 'Test User' }, wa_id: '4915112345678' },
                ],
                messages: [
                  {
                    from: '4915112345678',
                    id: 'wamid.img2',
                    timestamp: '1612345680',
                    type: 'image',
                    image: { id: 'img-2' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    await processor.process({ data: payload3 } as any);

    await tenantStorage.run({ isSystemBypass: true }, async () => {
      const msg = await prisma.message.findFirst({
        where: { metaMessageId: 'wamid.img2' },
      });
      expect(msg!.mediaUrl).toContain('mockbase64');
    });

    // 4. Withdrawal
    const payload4 = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '123456789',
          changes: [
            {
              value: {
                metadata: {
                  display_phone_number: '123456789',
                  phone_number_id: '123456789',
                },
                contacts: [
                  { profile: { name: 'Test User' }, wa_id: '4915112345678' },
                ],
                messages: [
                  {
                    from: '4915112345678',
                    id: 'wamid.withdraw',
                    timestamp: '1612345681',
                    type: 'text',
                    text: { body: 'WITHDRAW CONSENT' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    await processor.process({ data: payload4 } as any);

    await tenantStorage.run({ isSystemBypass: true }, async () => {
      const lead = await prisma.lead.findFirst({
        where: { phoneNumber: '4915112345678' },
      });
      expect(lead!.mediaConsentGranted).toBe(false);

      const msg = await prisma.message.findFirst({
        where: { metaMessageId: 'wamid.img2' },
      });
      expect(msg!.mediaUrl).toBeNull();
      expect(msg!.content).toContain('Media removed');
    });

    // A patient opt-out pauses automation for this clinic's conversation.
    const payloadStop = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '123456789',
          changes: [
            {
              value: {
                metadata: {
                  display_phone_number: '123456789',
                  phone_number_id: '123456789',
                },
                contacts: [
                  { profile: { name: 'Test User' }, wa_id: '4915112345678' },
                ],
                messages: [
                  {
                    from: '4915112345678',
                    id: 'wamid.stop',
                    timestamp: '1612345682',
                    type: 'text',
                    text: { body: 'STOP' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    await processor.process({ data: payloadStop } as any);
    await tenantStorage.run({ isSystemBypass: true }, async () => {
      const lead = await prisma.lead.findFirstOrThrow({
        where: { phoneNumber: '4915112345678' },
      });
      const conversation = await prisma.conversation.findFirstOrThrow({
        where: { leadId: lead.id },
      });
      expect(lead.optedOutAt).not.toBeNull();
      expect(conversation.aiPaused).toBe(true);

      // Exercise the real expiry cleanup against an isolated synthetic row.
      const expired = await prisma.message.update({
        where: { metaMessageId: 'wamid.img2' },
        data: {
          mediaUrl: 'synthetic-expired-media',
          mediaExpiresAt: new Date(Date.now() - 1000),
        },
      });
      await new WhatsappMediaService(prisma).cleanupExpiredMedia();
      const cleaned = await prisma.message.findUniqueOrThrow({
        where: { id: expired.id },
      });
      expect(cleaned.mediaUrl).toBeNull();
      expect(cleaned.content).toBe('[Patient Media - Expired and Deleted]');
      expect(
        await prisma.auditLog.count({
          where: { action: 'media.expired_deleted', targetId: expired.id },
        }),
      ).toBe(1);
    });
  });
});
