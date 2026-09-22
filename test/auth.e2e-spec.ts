import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

describe('Authentication (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/auth/signup (POST)', async () => {
    const email = `test-${Date.now()}@example.com`;
    const res = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        email,
        password: 'password123',
        firstName: 'Test',
        lastName: 'User'
      })
      .expect(201);
    
    expect(res.body.access_token).toBeDefined();
    
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email,
        password: 'password123'
      })
      .expect(200);
      
    expect(loginRes.body.access_token).toBeDefined();
    
    // Cookie should be returned
    const cookies = loginRes.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const refreshTokenCookie = cookies.find((c: string) => c.startsWith('refresh_token='));
    expect(refreshTokenCookie).toBeDefined();
    
    // Refresh with Token A -> Token B
    const refresh1Res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', [refreshTokenCookie])
      .expect(200);
      
    const cookiesB = refresh1Res.headers['set-cookie'];
    const refreshTokenCookieB = cookiesB.find((c: string) => c.startsWith('refresh_token='));
    
    // Attempt reuse of Token A -> should 401 and revoke family
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', [refreshTokenCookie])
      .expect(401);
      
    // Attempt use of Token B (should now be revoked) -> 401
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', [refreshTokenCookieB])
      .expect(401);
  });
});
