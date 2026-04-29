import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { I18nService } from 'nestjs-i18n';
import { AuthTokenType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { TokenManagementService } from './services/token-management.service';
import { MailingService } from './services/mailing.service';
import { RequestContextService } from '../request-context/request-context.service';

describe('AuthService', () => {
  let service: AuthService;

  const mockPrisma = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    organizationMembership: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    membershipPermissionOverride: {
      findMany: jest.fn(),
    },
    invitation: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
  };

  const mockI18n = {
    t: jest.fn((key: string) => key),
  };

  const mockTokenManagementService = {
    issueToken: jest.fn(),
    validateAndRevokeToken: jest.fn(),
    consumeToken: jest.fn(),
    revokeAllUserTokens: jest.fn(),
    revokeTokenIfExists: jest.fn(),
  };

  const mockMailingService = {
    sendVerificationEmail: jest.fn(),
    sendPasswordResetEmail: jest.fn(),
  };

  const mockRequestContextService = {
    runWithBypass: jest.fn(async (callback: () => Promise<unknown>) =>
      callback(),
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mockPrisma) => Promise<unknown>) =>
        callback(mockPrisma),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: I18nService, useValue: mockI18n },
        {
          provide: TokenManagementService,
          useValue: mockTokenManagementService,
        },
        {
          provide: MailingService,
          useValue: mockMailingService,
        },
        {
          provide: RequestContextService,
          useValue: mockRequestContextService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('returns null when validating unknown user', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const result = await service.validateUser('missing@example.com', 'secret');

    expect(result).toBeNull();
  });

  it('throws ForbiddenException on login when email is not verified', async () => {
    await expect(
      service.login({
        id: 'u1',
        email: 'user@example.com',
        first_name: 'A',
        last_name: 'B',
        created_at: new Date(),
        is_email_verified: false,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('returns access and refresh tokens on verified login', async () => {
    mockPrisma.organizationMembership.findFirst.mockResolvedValue(null);
    mockJwtService.sign.mockReturnValue('access-token');
    mockTokenManagementService.issueToken.mockResolvedValue('refresh-token');

    const result = await service.login({
      id: 'u1',
      email: 'user@example.com',
      first_name: 'A',
      last_name: 'B',
      created_at: new Date('2026-03-30T00:00:00.000Z'),
      is_email_verified: true,
    });

    expect(mockTokenManagementService.issueToken).toHaveBeenCalledWith(
      'u1',
      AuthTokenType.REFRESH,
      7 * 24 * 60 * 60 * 1000,
    );
    expect(mockJwtService.sign).toHaveBeenCalledWith(
      {
        sub: 'u1',
        email: 'user@example.com',
        first_name: 'A',
        last_name: 'B',
        created_at: '2026-03-30T00:00:00.000Z',
      },
      { expiresIn: '15m' },
    );
    expect(result).toEqual({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      user: {
        id: 'u1',
        email: 'user@example.com',
        first_name: 'A',
        last_name: 'B',
        created_at: new Date('2026-03-30T00:00:00.000Z'),
        permissions: [],
      },
    });
  });

  it('creates user with unverified email and sends verification token on register', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-password' as never);
    mockPrisma.user.create.mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
      password_hash: 'hashed-password',
      first_name: 'A',
      last_name: 'B',
      is_email_verified: false,
      created_at: new Date('2026-03-30T01:00:00.000Z'),
    });
    mockTokenManagementService.issueToken.mockResolvedValue(
      'verification-token',
    );

    const result = await service.register(
      'user@example.com',
      'secret',
      'A',
      'B',
    );

    expect(mockPrisma.user.create).toHaveBeenCalledWith({
      data: {
        email: 'user@example.com',
        password_hash: 'hashed-password',
        first_name: 'A',
        last_name: 'B',
        is_email_verified: false,
      },
    });
    expect(mockTokenManagementService.issueToken).toHaveBeenCalledWith(
      'u1',
      AuthTokenType.VERIFICATION,
      24 * 60 * 60 * 1000,
    );
    expect(mockMailingService.sendVerificationEmail).toHaveBeenCalledWith(
      'user@example.com',
      'verification-token',
    );
    expect(result).toEqual({
      id: 'u1',
      email: 'user@example.com',
      first_name: 'A',
      last_name: 'B',
      created_at: new Date('2026-03-30T01:00:00.000Z'),
    });
  });

  it('throws when registering an existing user', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'u1' });

    await expect(
      service.register('user@example.com', 'secret', 'A', 'B'),
    ).rejects.toThrow(BadRequestException);
  });

  it('issues and emails password reset token for existing users', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
    });
    mockTokenManagementService.issueToken.mockResolvedValue('reset-token');

    await service.requestPasswordReset('user@example.com');

    expect(mockTokenManagementService.issueToken).toHaveBeenCalledWith(
      'u1',
      AuthTokenType.RESET,
      15 * 60 * 1000,
    );
    expect(mockMailingService.sendPasswordResetEmail).toHaveBeenCalledWith(
      'user@example.com',
      'reset-token',
    );
  });

  it('silently returns on password reset request for missing user', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);

    await expect(
      service.requestPasswordReset('missing@example.com'),
    ).resolves.toBeUndefined();

    expect(mockTokenManagementService.issueToken).not.toHaveBeenCalled();
    expect(mockMailingService.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('resets password and revokes all refresh tokens', async () => {
    mockTokenManagementService.consumeToken.mockResolvedValue('u1');
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('new-hash' as never);
    mockPrisma.user.update.mockResolvedValue({ id: 'u1' });

    await service.resetPassword('reset-token', 'newPassword');

    expect(mockTokenManagementService.consumeToken).toHaveBeenCalledWith(
      'reset-token',
      AuthTokenType.RESET,
    );
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { password_hash: 'new-hash' },
    });
    expect(mockTokenManagementService.revokeAllUserTokens).toHaveBeenCalledWith(
      'u1',
      AuthTokenType.REFRESH,
    );
  });

  it('verifies email using one-time token', async () => {
    mockTokenManagementService.validateAndRevokeToken.mockResolvedValue('u1');
    mockPrisma.organizationMembership.findFirst.mockResolvedValue(null);
    mockJwtService.sign.mockReturnValue('access-token');
    mockTokenManagementService.issueToken.mockResolvedValue('refresh-token');
    mockPrisma.user.update.mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
      first_name: 'A',
      last_name: 'B',
      created_at: new Date('2026-03-30T00:00:00.000Z'),
      is_email_verified: true,
    });

    const result = await service.verifyEmail('verification-token');

    expect(
      mockTokenManagementService.validateAndRevokeToken,
    ).toHaveBeenCalledWith(
      null,
      'verification-token',
      AuthTokenType.VERIFICATION,
    );
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { is_email_verified: true },
    });
    expect(mockTokenManagementService.issueToken).toHaveBeenCalledWith(
      'u1',
      AuthTokenType.REFRESH,
      7 * 24 * 60 * 60 * 1000,
    );
    expect(result).toEqual({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      user: {
        id: 'u1',
        email: 'user@example.com',
        first_name: 'A',
        last_name: 'B',
        created_at: new Date('2026-03-30T00:00:00.000Z'),
        permissions: [],
      },
    });
  });

  it('resends verification for existing unverified users', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
      is_email_verified: false,
    });
    mockTokenManagementService.issueToken.mockResolvedValue(
      'verification-token',
    );

    const result = await service.resendVerification('user@example.com');

    expect(mockTokenManagementService.revokeAllUserTokens).toHaveBeenCalledWith(
      'u1',
      AuthTokenType.VERIFICATION,
    );
    expect(mockTokenManagementService.issueToken).toHaveBeenCalledWith(
      'u1',
      AuthTokenType.VERIFICATION,
      24 * 60 * 60 * 1000,
    );
    expect(mockMailingService.sendVerificationEmail).toHaveBeenCalledWith(
      'user@example.com',
      'verification-token',
    );
    expect(result).toEqual({
      message: 'If an account exists, a link has been sent',
    });
  });

  it('returns generic message when resending verification for missing users', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);

    const result = await service.resendVerification('missing@example.com');

    expect(
      mockTokenManagementService.revokeAllUserTokens,
    ).not.toHaveBeenCalled();
    expect(mockTokenManagementService.issueToken).not.toHaveBeenCalled();
    expect(mockMailingService.sendVerificationEmail).not.toHaveBeenCalled();
    expect(result).toEqual({
      message: 'If an account exists, a link has been sent',
    });
  });

  it('returns generic message when resending verification for already verified users', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
      is_email_verified: true,
    });

    const result = await service.resendVerification('user@example.com');

    expect(
      mockTokenManagementService.revokeAllUserTokens,
    ).not.toHaveBeenCalled();
    expect(mockTokenManagementService.issueToken).not.toHaveBeenCalled();
    expect(mockMailingService.sendVerificationEmail).not.toHaveBeenCalled();
    expect(result).toEqual({
      message: 'If an account exists, a link has been sent',
    });
  });

  it('rotates refresh token and returns new access token', async () => {
    mockTokenManagementService.consumeToken.mockResolvedValue('u1');
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
      first_name: 'A',
      last_name: 'B',
      created_at: new Date('2026-03-30T02:00:00.000Z'),
      is_email_verified: true,
    });
    mockTokenManagementService.issueToken.mockResolvedValue('rotated-refresh');
    mockJwtService.sign.mockReturnValue('rotated-access');

    const result = await service.refreshAccessToken('old-refresh');

    expect(result).toEqual({
      access_token: 'rotated-access',
      refresh_token: 'rotated-refresh',
    });
  });

  it('rejects refresh flow for unknown users', async () => {
    mockTokenManagementService.consumeToken.mockResolvedValue('u1');
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(service.refreshAccessToken('old-refresh')).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
