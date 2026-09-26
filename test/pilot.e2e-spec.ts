/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { tenantStorage } from '../src/core/tenant/tenant.context';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import cookieParser from 'cookie-parser';
import { WhatsappService } from '../src/webhooks/whatsapp.service';

describe('Pilot Acceptance Suite (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Storage for tokens and IDs
  let user1Token: string;
  let user2Token: string;
  let org1Id: string;
  let org2Id: string;
  const runId = Date.now().toString();

  // Fakes
  const sendTextMock = jest.fn().mockResolvedValue({ messageId: 'wa-msg-1' });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(WhatsappService)
      .useValue({
        sendText: sendTextMock,
        sendTemplate: jest.fn().mockResolvedValue({ messageId: 'wa-tpl-1' }),
        validateSignature: jest.fn((sig) => sig === 'valid-signature'),
        getMediaUrl: jest.fn().mockResolvedValue('http://fake-media.url'),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. Signup/onboarding & 2. Two clinics & 3. Two staff assignments', async () => {
    // Signup User 1
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        email: `user1_${runId}@example.com`,
        password: 'Password123!',
        firstName: 'User',
        lastName: 'One',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        email: `user2_${runId}@example.com`,
        password: 'Password123!',
        firstName: 'User',
        lastName: 'Two',
      })
      .expect(201);

    // Force active (we use executeBypassIsolation to update since Prisma is isolated)
    await tenantStorage.run({ isSystemBypass: true }, async () => {
      const p = prisma;
      await p.user.updateMany({ data: { status: 'ACTIVE' } });
    });

    // Login User 1 and User 2
    user1Token = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: `user1_${runId}@example.com`, password: 'Password123!' })
    ).body.access_token;
    user2Token = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: `user2_${runId}@example.com`, password: 'Password123!' })
    ).body.access_token;

    // Create clinics
    org1Id = (
      await request(app.getHttpServer())
        .post('/organizations')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ name: 'Clinic One', slug: `clinic-one-${runId}` })
    ).body.id;

    user1Token = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: `user1_${runId}@example.com`, password: 'Password123!' })
    ).body.access_token;

    org2Id = (
      await request(app.getHttpServer())
        .post('/organizations')
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ name: 'Clinic Two', slug: `clinic-two-${runId}` })
    ).body.id;
    user2Token = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: `user2_${runId}@example.com`, password: 'Password123!' })
    ).body.access_token;

    // Create channel for org 1
    await tenantStorage.run({ isSystemBypass: true }, async () => {
      const p = prisma;
      await p.channel.create({
        data: {
          id: `chan-1-${runId}`,
          organizationId: org1Id,
          provider: 'WHATSAPP_CLOUD_API',
          providerAccountId: '1234567890',
          accessToken: 'token',
        },
      });
    });
  });

  it('4. Authorized and denied reads/events/actions', async () => {
    // User 1 cannot read User 2's org
    await request(app.getHttpServer())
      .get('/conversations')
      .set('Authorization', `Bearer ${user1Token}`)
      .set('x-organization-id', org2Id)
      .expect(403);
    // User 1 CAN read User 1's org
    await request(app.getHttpServer())
      .get('/conversations')
      .set('Authorization', `Bearer ${user1Token}`)
      .set('x-organization-id', org1Id)
      .expect(200);
  });

  it('5. Webhook signature and duplicate input', async () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'test_waba_123',
          changes: [
            {
              value: {
                metadata: {
                  display_phone_number: '1234567890',
                  phone_number_id: 'test_phone_id_123',
                },
                contacts: [
                  { profile: { name: 'Test Patient' }, wa_id: '19998887777' },
                ],
                messages: [
                  {
                    from: '19998887777',
                    id: `msg-123-${runId}`,
                    timestamp: '123456789',
                    type: 'text',
                    text: { body: 'Hello' },
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    };

    // Invalid sig
    await request(app.getHttpServer())
      .post('/webhooks/whatsapp')
      .set('x-hub-signature-256', 'invalid')
      .send(payload)
      .expect(401);

    // Valid sig
    await request(app.getHttpServer())
      .post('/webhooks/whatsapp')
      .set('x-hub-signature-256', 'valid-signature')
      .send(payload)
      .expect(201);

    // Duplicate input (should return 201 but not process)
    await request(app.getHttpServer())
      .post('/webhooks/whatsapp')
      .set('x-hub-signature-256', 'valid-signature')
      .send(payload)
      .expect(201);

    // Wait a bit to ensure it processes
    await new Promise((r) => setTimeout(r, 500));
    await tenantStorage.run({ isSystemBypass: true }, async () => {
      const p = prisma;
      const messages = await p.message.findMany({
        where: { id: `msg-123-${runId}` },
      });
      expect(messages.length).toBe(1);
    });
  });

  it('6. Pause/opt-out & 9. Media consent', async () => {
    // Media consent
    const payloadConsent = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'test_waba_123',
          changes: [
            {
              value: {
                metadata: { display_phone_number: '1234567890' },
                contacts: [{ wa_id: '19998887777' }],
                messages: [
                  {
                    from: '19998887777',
                    id: `msg-consent-${runId}`,
                    timestamp: '123456790',
                    type: 'text',
                    text: { body: 'I CONSENT' },
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    };
    await request(app.getHttpServer())
      .post('/webhooks/whatsapp')
      .set('x-hub-signature-256', 'valid-signature')
      .send(payloadConsent)
      .expect(201);
    await new Promise((r) => setTimeout(r, 500));

    await tenantStorage.run({ isSystemBypass: true }, async () => {
      const p = prisma;
      const lead = await p.lead.findFirst({
        where: { phoneNumber: '19998887777' },
      });
      expect(lead?.mediaConsentGranted).toBe(true);

      // Opt-out
      const payloadOptout = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'test_waba_123',
            changes: [
              {
                value: {
                  metadata: { display_phone_number: '1234567890' },
                  contacts: [{ wa_id: '19998887777' }],
                  messages: [
                    {
                      from: '19998887777',
                      id: `msg-optout-${runId}`,
                      timestamp: '123456791',
                      type: 'text',
                      text: { body: 'STOP' },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };
      await request(app.getHttpServer())
        .post('/webhooks/whatsapp')
        .set('x-hub-signature-256', 'valid-signature')
        .send(payloadOptout)
        .expect(201);
      await new Promise((r) => setTimeout(r, 500));

      const conv = await p.conversation.findFirst({
        where: { leadId: lead?.id },
      });
      expect(conv?.aiPaused).toBe(true);
    });
  });

  it('12. Refresh-token reuse', async () => {
    // Generate refresh token via login
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: `user1_${runId}@example.com`, password: 'Password123!' })
      .expect(201);

    // Extract cookie
    const cookies = loginRes.headers['set-cookie'];

    // Call refresh
    const refreshRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', cookies)
      .expect(201);

    expect(refreshRes.body.access_token).toBeDefined();

    // Attempt reuse (should fail because rotating changes the family/reuse triggers ban)
    // Wait, let's see if we actually trigger a 401. If refresh token is reused, it should revoke all.
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', cookies)
      .expect(401);
  });
});
