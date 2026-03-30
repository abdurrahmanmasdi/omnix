import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;

  const mockAuthService = {
    register: jest.fn(),
    login: jest.fn(),
    validateUser: jest.fn(),
    getEffectivePermissions: jest.fn(),
    verifyEmail: jest.fn(),
    requestPasswordReset: jest.fn(),
    resetPassword: jest.fn(),
    refreshAccessToken: jest.fn(),
    logout: jest.fn(),
  };

  const mockI18n = {
    t: jest.fn((key: string) => key),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: I18nService,
          useValue: mockI18n,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('sets refresh cookie and returns access token payload on login', async () => {
    const createdAt = new Date();
    const validatedUser = {
      id: 'u1',
      email: 'user@example.com',
      first_name: 'A',
      last_name: 'B',
      created_at: createdAt,
      is_email_verified: true,
    };

    mockAuthService.validateUser.mockResolvedValue(validatedUser);
    mockAuthService.login.mockResolvedValue({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      user: {
        id: 'u1',
        email: 'user@example.com',
        first_name: 'A',
        last_name: 'B',
        created_at: createdAt,
        permissions: ['leads:read'],
      },
    });

    const res = {
      cookie: jest.fn(),
    };

    const result = await controller.login(
      {
        email: 'user@example.com',
        password: 'secret',
      },
      res as any,
    );

    expect(res.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'refresh-token',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      }) as Record<string, unknown>,
    );
    expect(result).toEqual({
      access_token: 'access-token',
      user: {
        id: 'u1',
        email: 'user@example.com',
        first_name: 'A',
        last_name: 'B',
        created_at: createdAt,
        permissions: ['leads:read'],
      },
    });
  });

  it('throws UnauthorizedException for invalid login credentials', async () => {
    mockAuthService.validateUser.mockResolvedValue(null);

    await expect(
      controller.login({ email: 'user@example.com', password: 'bad' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('refreshes access token and rotates cookie', async () => {
    mockAuthService.refreshAccessToken.mockResolvedValue({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
    });

    const req = {
      cookies: {
        refresh_token: 'old-refresh',
      },
    };
    const res = {
      cookie: jest.fn(),
    };

    const result = await controller.refresh(req as any, res as any);

    expect(mockAuthService.refreshAccessToken).toHaveBeenCalledWith(
      'old-refresh',
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'new-refresh',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'strict',
      }) as Record<string, unknown>,
    );
    expect(result).toEqual({ access_token: 'new-access' });
  });

  it('throws UnauthorizedException when refresh cookie is missing', async () => {
    await expect(controller.refresh({ cookies: {} } as any)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('clears refresh cookie and revokes token on logout', async () => {
    const req = {
      cookies: {
        refresh_token: 'refresh-token',
      },
    };
    const res = {
      clearCookie: jest.fn(),
    };

    const result = await controller.logout(req as any, res as any);

    expect(mockAuthService.logout).toHaveBeenCalledWith('refresh-token');
    expect(res.clearCookie).toHaveBeenCalledWith(
      'refresh_token',
      expect.objectContaining({ httpOnly: true, sameSite: 'strict' }) as Record<
        string,
        unknown
      >,
    );
    expect(result).toEqual({ message: 'Logged out' });
  });

  it('delegates email verification', async () => {
    await controller.verifyEmail({ token: 'verification-token' });

    expect(mockAuthService.verifyEmail).toHaveBeenCalledWith(
      'verification-token',
    );
  });

  it('delegates password reset request', async () => {
    await controller.requestPasswordReset({ email: 'user@example.com' });

    expect(mockAuthService.requestPasswordReset).toHaveBeenCalledWith(
      'user@example.com',
    );
  });

  it('delegates password reset confirmation', async () => {
    await controller.resetPassword({
      token: 'reset-token',
      newPassword: 'new-password',
    });

    expect(mockAuthService.resetPassword).toHaveBeenCalledWith(
      'reset-token',
      'new-password',
    );
  });

  it('returns user with effective permissions in getProfile', async () => {
    const createdAt = new Date();
    const user = {
      id: 'u1',
      email: 'user@example.com',
      first_name: 'A',
      last_name: 'B',
      created_at: createdAt,
    };
    const req = { user };

    mockAuthService.getEffectivePermissions.mockResolvedValue([
      'leads:read',
      'leads:create',
    ]);

    const result = await controller.getProfile(req, 'org-1');

    expect(mockAuthService.getEffectivePermissions).toHaveBeenCalledWith(
      'u1',
      'org-1',
    );
    expect(result).toEqual({
      ...user,
      permissions: ['leads:read', 'leads:create'],
    });
  });
});
