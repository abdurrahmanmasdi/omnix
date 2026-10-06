import type { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import request from 'supertest';
import { UserProfileController } from './user-profile.controller';
import { UserProfileService } from './user-profile.service';
import { JwtUserGuard } from './guards/jwt-user.guard';
import { CustomThrottlerGuard } from '../core/guards/custom-throttler.guard';

describe('self profile validation', () => {
  let app: INestApplication<Server>;
  const profiles = {
    get: jest.fn().mockResolvedValue({ id: 'self' }),
    update: jest.fn().mockResolvedValue({ id: 'self' }),
    changePassword: jest.fn().mockResolvedValue({ access_token: 'renewed' }),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [UserProfileController],
      providers: [{ provide: UserProfileService, useValue: profiles }],
    })
      .overrideGuard(JwtUserGuard)
      .useValue({
        canActivate: (c: ExecutionContext) => {
          c.switchToHttp().getRequest().user = {
            id: 'self',
            organizationId: null,
          };
          return true;
        },
      })
      .overrideGuard(CustomThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });
  afterAll(() => app.close());
  it('reads self', async () => {
    await request(app.getHttpServer()).get('/users/me').expect(200);
    expect(profiles.get).toHaveBeenCalledWith('self');
  });
  it('updates only self and accepts empty phone', async () => {
    await request(app.getHttpServer())
      .patch('/users/me')
      .send({ firstName: 'Updated', phoneNumber: '' })
      .expect(200);
    expect(profiles.update).toHaveBeenCalledWith(
      'self',
      expect.objectContaining({ firstName: 'Updated', phoneNumber: '' }),
    );
  });
  it.each([
    { userId: 'other' },
    { email: 'other@example.invalid' },
    { phoneNumber: '5551234' },
    { whatsappNumber: 'bad' },
    { firstName: ' '.repeat(5) },
    { firstName: 'a'.repeat(101) },
    { locale: 'FR' },
    { spokenLanguages: ['x'.repeat(51)] },
  ])('rejects invalid profile %j', async (data) => {
    await request(app.getHttpServer())
      .patch('/users/me')
      .send(data)
      .expect(400);
  });
  it.each(['short', 'ع'.repeat(37)])(
    'rejects short or oversized UTF-8 password',
    async (newPassword) => {
      await request(app.getHttpServer())
        .post('/users/me/password')
        .send({ currentPassword: 'current', newPassword })
        .expect(400);
    },
  );
  it('accepts password request without logging values', async () => {
    await request(app.getHttpServer())
      .post('/users/me/password')
      .send({
        currentPassword: 'current',
        newPassword: 'SyntheticNewPassword123',
      })
      .expect(200, { access_token: 'renewed' });
  });
});
