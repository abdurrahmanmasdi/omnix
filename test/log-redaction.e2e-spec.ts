/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, LoggerService } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

// Custom logger to capture logs
class TestLogger implements LoggerService {
  public logs: string[] = [];

  log(message: any, ...optionalParams: any[]) {
    this.logs.push(JSON.stringify(message) + JSON.stringify(optionalParams));
  }
  error(message: any, ...optionalParams: any[]) {
    this.logs.push(JSON.stringify(message) + JSON.stringify(optionalParams));
  }
  warn(message: any, ...optionalParams: any[]) {
    this.logs.push(JSON.stringify(message) + JSON.stringify(optionalParams));
  }
  debug?(message: any, ...optionalParams: any[]) {
    this.logs.push(JSON.stringify(message) + JSON.stringify(optionalParams));
  }
  verbose?(message: any, ...optionalParams: any[]) {
    this.logs.push(JSON.stringify(message) + JSON.stringify(optionalParams));
  }
}

describe('Log Redaction (e2e)', () => {
  let app: INestApplication;
  let testLogger: TestLogger;

  beforeAll(async () => {
    testLogger = new TestLogger();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useLogger(testLogger);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should not log sensitive sentinel values', async () => {
    const SENTINEL_PHONE = '+19998887777';
    const SENTINEL_DISEASE = 'SENTINEL_HIV_STATUS';
    const SENTINEL_SECRET = 'super_secret_token_123';

    // Fire a webhook containing sensitive data
    await request(app.getHttpServer())
      .post('/webhooks/whatsapp')
      .send({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'test-org-123',
            changes: [
              {
                value: {
                  metadata: { phone_number_id: SENTINEL_SECRET },
                  contacts: [
                    { profile: { name: 'Test User' }, wa_id: SENTINEL_PHONE },
                  ],
                  messages: [
                    {
                      from: SENTINEL_PHONE,
                      id: 'wamid.test',
                      timestamp: '1690000000',
                      text: {
                        body: `I have ${SENTINEL_DISEASE}, please help.`,
                      },
                      type: 'text',
                    },
                  ],
                },
              },
            ],
          },
        ],
      });

    // Fire an auth error with sensitive data
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: `test-${SENTINEL_SECRET}@example.com`,
        password: 'wrong',
      });

    // Ensure logs don't contain any of the sentinels
    for (const log of testLogger.logs) {
      expect(log).not.toContain(SENTINEL_PHONE);
      expect(log).not.toContain('19998887777'); // without plus
      expect(log).not.toContain(SENTINEL_DISEASE);
      expect(log).not.toContain(SENTINEL_SECRET);
    }
  });
});
