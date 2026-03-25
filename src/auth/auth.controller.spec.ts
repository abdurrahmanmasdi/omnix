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

  it('should return access token when login credentials are valid', async () => {
    mockAuthService.validateUser.mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
    });
    mockAuthService.login.mockReturnValue({ access_token: 'jwt-token' });

    const result = await controller.login({
      email: 'user@example.com',
      password: 'secret',
    });

    expect(result).toEqual({ access_token: 'jwt-token' });
    expect(mockAuthService.login).toHaveBeenCalled();
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

  it('should return request user in getProfile', () => {
    const req = {
      user: {
        id: 'u1',
        email: 'user@example.com',
        first_name: 'A',
        last_name: 'B',
        created_at: new Date(),
      },
    };

    const result = controller.getProfile(req);

    expect(result).toEqual(req.user);
  });
});
