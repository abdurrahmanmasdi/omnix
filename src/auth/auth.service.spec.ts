import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService', () => {
  let provider: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: { methodName: jest.fn() } },
        { provide: JwtService, useValue: { methodName: jest.fn() } },
        { provide: ConfigService, useValue: { methodName: jest.fn() } }
      ],
      controllers: []
    }).compile();

    provider = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
});
