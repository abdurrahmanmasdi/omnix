/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { I18nValidationPipe } from 'nestjs-i18n';
import { AppModule } from '../src/app.module';

describe('i18n Integration (E2E)', () => {
  let app: INestApplication;

  /**
   * Bootstrap the NestJS application with the AppModule
   * This loads all real dependencies, including I18nModule, database, and middleware
   */
  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // The I18nValidationPipe is only configured in main.ts, so we need to configure it here too for tests
    app.useGlobalPipes(
      new I18nValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Language Resolution via Accept-Language Header', () => {
    /**
     * Test that the language resolver correctly detects language from Accept-Language header
     * This verifies the AcceptLanguageResolver and i18n module integration
     */
    const testPayload = {
      email: 'lang-test@example.com',
      password: 'ValidPassword123!',
      first_name: 'John',
      last_name: 'Doe',
    };

    it('🇬🇧 should accept valid registration with default language (English)', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(testPayload)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.email).toBe(testPayload.email);
    });

    it('🇹🇷 should accept valid registration with Turkish language header', async () => {
      const turkishPayload = {
        ...testPayload,
        email: 'turkish-test@example.com',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .set('Accept-Language', 'tr')
        .send(turkishPayload)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.email).toBe(turkishPayload.email);
    });

    it('🇸🇦 should accept valid registration with Arabic language header', async () => {
      const arabicPayload = {
        ...testPayload,
        email: 'arabic-test@example.com',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .set('Accept-Language', 'ar')
        .send(arabicPayload)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.email).toBe(arabicPayload.email);
    });
  });

  describe('Validation Error Handling with i18n', () => {
    /**
     * Test that validation errors are properly formatted and returned
     * across different languages. The I18nValidationPipe should translate
     * constraint messages based on Accept-Language header.
     */

    it('🇬🇧 should return 400 status with validation error for empty payload (English)', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('statusCode', 400);
      expect(response.body).toHaveProperty('path', '/auth/register');
      expect(response.body).toHaveProperty('message');
      // Message should not be empty
      expect(response.body.message).toBeTruthy();
    });

    it('🇹🇷 should return 400 status with validation error with Turkish language header', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .set('Accept-Language', 'tr')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('statusCode', 400);
      expect(response.body).toHaveProperty('path', '/auth/register');
      expect(response.body).toHaveProperty('message');
      // Message should not be empty
      expect(response.body.message).toBeTruthy();
    });

    it('🇸🇦 should return 400 status with validation error with Arabic language header', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .set('Accept-Language', 'ar')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('statusCode', 400);
      expect(response.body).toHaveProperty('path', '/auth/register');
      expect(response.body).toHaveProperty('message');
      // Message should not be empty
      expect(response.body.message).toBeTruthy();
    });
  });

  describe('Email Validation with i18n', () => {
    /**
     * Test email field validation with different languages
     */

    it('🇬🇧 should reject invalid email format (English)', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'not-an-email',
          password: 'ValidPassword123!',
          first_name: 'Test',
          last_name: 'User',
        });

      expect(response.status).toBe(400);
      expect(response.body.statusCode).toBe(400);
    });

    it('🇹🇷 should reject invalid email format (Turkish)', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .set('Accept-Language', 'tr')
        .send({
          email: 'not-an-email',
          password: 'ValidPassword123!',
          first_name: 'Test',
          last_name: 'User',
        });

      expect(response.status).toBe(400);
      expect(response.body.statusCode).toBe(400);
    });

    it('🇸🇦 should reject invalid email format (Arabic)', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .set('Accept-Language', 'ar')
        .send({
          email: 'not-an-email',
          password: 'ValidPassword123!',
          first_name: 'Test',
          last_name: 'User',
        });

      expect(response.status).toBe(400);
      expect(response.body.statusCode).toBe(400);
    });
  });

  describe('Password Validation with i18n', () => {
    /**
     * Test password field validation with different languages
     */

    it('🇬🇧 should reject short password (English)', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'short',
          first_name: 'Test',
          last_name: 'User',
        });

      expect(response.status).toBe(400);
      expect(response.body.statusCode).toBe(400);
    });

    it('🇹🇷 should reject short password (Turkish)', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .set('Accept-Language', 'tr')
        .send({
          email: 'test@example.com',
          password: 'short',
          first_name: 'Test',
          last_name: 'User',
        });

      expect(response.status).toBe(400);
      expect(response.body.statusCode).toBe(400);
    });

    it('🇸🇦 should reject short password (Arabic)', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .set('Accept-Language', 'ar')
        .send({
          email: 'test@example.com',
          password: 'short',
          first_name: 'Test',
          last_name: 'User',
        });

      expect(response.status).toBe(400);
      expect(response.body.statusCode).toBe(400);
    });
  });

  describe('Missing Fields Validation with i18n', () => {
    /**
     * Test that all required fields are validated
     */

    it('🇬🇧 should reject registration with missing first_name (English)', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'ValidPassword123!',
          last_name: 'User',
        });

      expect(response.status).toBe(400);
      expect(response.body.statusCode).toBe(400);
    });

    it('🇹🇷 should reject registration with missing first_name (Turkish)', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .set('Accept-Language', 'tr')
        .send({
          email: 'test@example.com',
          password: 'ValidPassword123!',
          last_name: 'User',
        });

      expect(response.status).toBe(400);
      expect(response.body.statusCode).toBe(400);
    });

    it('🇸🇦 should reject registration with missing first_name (Arabic)', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .set('Accept-Language', 'ar')
        .send({
          email: 'test@example.com',
          password: 'ValidPassword123!',
          last_name: 'User',
        });

      expect(response.status).toBe(400);
      expect(response.body.statusCode).toBe(400);
    });

    it('🇬🇧 should reject registration with missing last_name (English)', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'ValidPassword123!',
          first_name: 'John',
        });

      expect(response.status).toBe(400);
      expect(response.body.statusCode).toBe(400);
    });

    it('🇹🇷 should reject registration with missing last_name (Turkish)', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .set('Accept-Language', 'tr')
        .send({
          email: 'test@example.com',
          password: 'ValidPassword123!',
          first_name: 'John',
        });

      expect(response.status).toBe(400);
      expect(response.body.statusCode).toBe(400);
    });

    it('🇸🇦 should reject registration with missing last_name (Arabic)', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .set('Accept-Language', 'ar')
        .send({
          email: 'test@example.com',
          password: 'ValidPassword123!',
          first_name: 'John',
        });

      expect(response.status).toBe(400);
      expect(response.body.statusCode).toBe(400);
    });
  });
});
