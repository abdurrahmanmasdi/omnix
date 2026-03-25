import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { I18nService } from 'nestjs-i18n';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  const mockJwtService = {
    sign: jest.fn(),
  };

  const mockI18n = {
    t: jest.fn((key: string) => key),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: I18nService, useValue: mockI18n },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should return null when validating unknown user', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const result = await service.validateUser('missing@example.com', 'secret');

    expect(result).toBeNull();
  });

  it('should return null when password does not match', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
      password_hash: 'hashed',
      first_name: 'A',
      last_name: 'B',
      created_at: new Date(),
    });
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

    const result = await service.validateUser('user@example.com', 'wrong');

    expect(result).toBeNull();
  });

  it('should return user without password when credentials are valid', async () => {
    const createdAt = new Date();
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
      password_hash: 'hashed',
      first_name: 'A',
      last_name: 'B',
      created_at: createdAt,
    });
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

    const result = await service.validateUser('user@example.com', 'correct');

    expect(result).toEqual({
      id: 'u1',
      email: 'user@example.com',
      first_name: 'A',
      last_name: 'B',
      created_at: createdAt,
    });
    expect(result).not.toHaveProperty('password_hash');
  });

  it('should sign and return access token on login', () => {
    mockJwtService.sign.mockReturnValue('jwt-token');

    const result = service.login({ id: 'u1', email: 'user@example.com' });

    expect(mockJwtService.sign).toHaveBeenCalledWith({
      sub: 'u1',
      email: 'user@example.com',
    });
    expect(result).toEqual({ access_token: 'jwt-token' });
  });

  it('should throw BadRequestException if user already exists on register', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1' });

    await expect(
      service.register('user@example.com', 'secret', 'A', 'B'),
    ).rejects.toThrow(BadRequestException);
  });

  it('should hash password and create user on register', async () => {
    const createdAt = new Date();
    mockPrisma.user.findUnique.mockResolvedValue(null);
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-password' as never);
    mockPrisma.user.create.mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
      password_hash: 'hashed-password',
      first_name: 'A',
      last_name: 'B',
      created_at: createdAt,
    });

    const result = await service.register(
      'user@example.com',
      'secret',
      'A',
      'B',
    );

    expect(bcrypt.hash).toHaveBeenCalledWith('secret', 10);
    expect(mockPrisma.user.create).toHaveBeenCalledWith({
      data: {
        email: 'user@example.com',
        password_hash: 'hashed-password',
        first_name: 'A',
        last_name: 'B',
      },
    });
    expect(result).toEqual({
      id: 'u1',
      email: 'user@example.com',
      first_name: 'A',
      last_name: 'B',
      created_at: createdAt,
    });
  });
});
