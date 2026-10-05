import type { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import request from 'supertest';
import { UserLocaleController } from './user-locale.controller';
import { JwtUserGuard } from './guards/jwt-user.guard';
import { PrismaService } from '../prisma/prisma.service';

describe('self locale endpoint', () => {
  let app: INestApplication<Server>;
  const update = jest.fn().mockResolvedValue({ locale: 'AR' });
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [UserLocaleController],
      providers: [{ provide: PrismaService, useValue: { user: { update } } }],
    })
      .overrideGuard(JwtUserGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = { id: 'self-id' };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });
  afterAll(() => app.close());
  it('updates only the authenticated user', async () => {
    await request(app.getHttpServer())
      .patch('/users/me/locale')
      .send({ locale: 'AR' })
      .expect(200, { locale: 'AR' });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'self-id' },
      data: { locale: 'AR' },
      select: { locale: true },
    });
  });
  it.each(['FR', 'en', null])('rejects invalid locale %s', async (locale) => {
    await request(app.getHttpServer())
      .patch('/users/me/locale')
      .send({ locale })
      .expect(400);
  });
  it('rejects another user id', async () => {
    await request(app.getHttpServer())
      .patch('/users/me/locale')
      .send({ locale: 'EN', userId: 'other' })
      .expect(400);
  });
});
