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
  };

  const mockI18n = {
    t: jest.fn((key: string) => key),
  };

  beforeEach(async () => {
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

  it('should return access token and user with permissions when login credentials are valid', async () => {
    const createdAt = new Date();
    const user = {
      id: 'u1',
      email: 'user@example.com',
      first_name: 'A',
      last_name: 'B',
      created_at: createdAt,
    };
    mockAuthService.validateUser.mockResolvedValue(user);
    mockAuthService.login.mockResolvedValue({
      access_token: 'jwt-token',
      user: { ...user, permissions: ['leads:read'] },
    });

    const result = await controller.login({
      email: 'user@example.com',
      password: 'secret',
    });

    expect(result).toEqual({
      access_token: 'jwt-token',
      user: { ...user, permissions: ['leads:read'] },
    });
    expect(mockAuthService.login).toHaveBeenCalledWith(user);
  });

  it('should throw UnauthorizedException when login credentials are invalid', async () => {
    mockAuthService.validateUser.mockResolvedValue(null);

    await expect(
      controller.login({ email: 'user@example.com', password: 'bad' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should delegate user registration', async () => {
    const created = {
      id: 'u1',
      email: 'user@example.com',
      first_name: 'A',
      last_name: 'B',
      created_at: new Date(),
    };
    mockAuthService.register.mockResolvedValue(created);

    const result = await controller.register({
      email: 'user@example.com',
      password: 'secret',
      first_name: 'A',
      last_name: 'B',
    });

    expect(mockAuthService.register).toHaveBeenCalledWith(
      'user@example.com',
      'secret',
      'A',
      'B',
    );
    expect(result).toEqual(created);
  });

  it('should return user with effective permissions in getProfile', async () => {
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

  it('should return empty permissions when x-organization-id header is missing in getProfile', async () => {
    const createdAt = new Date();
    const user = {
      id: 'u1',
      email: 'user@example.com',
      first_name: 'A',
      last_name: 'B',
      created_at: createdAt,
    };
    const req = { user };

    const result = await controller.getProfile(req, undefined);

    expect(result).toEqual({
      ...user,
      permissions: [],
    });
  });
});
