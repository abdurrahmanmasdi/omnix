import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailingService } from './mailing.service';

describe('MailingService', () => {
  let service: MailingService;

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailingService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<MailingService>(MailingService);
  });

  it('logs dev-mode reset link when SMTP is disabled and not production', async () => {
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'FRONTEND_URL') return 'http://localhost:3000/';
      if (key === 'SMTP_ENABLED') return false;
      if (key === 'NODE_ENV') return 'development';
      return undefined;
    });

    const logSpy = jest.spyOn(
      service['logger'] as { log: (message: string) => void },
      'log',
    );

    await service.sendPasswordResetEmail('user@example.com', 'raw-token');

    expect(logSpy).toHaveBeenCalledWith(
      '[DEV MODE] Password Reset Link generated: http://localhost:3000/auth/reset-password?token=raw-token',
    );
  });

  it('dispatches password reset email when SMTP is enabled', async () => {
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'FRONTEND_URL') return 'https://app.example.com';
      if (key === 'SMTP_ENABLED') return true;
      if (key === 'NODE_ENV') return 'development';
      return undefined;
    });

    const logSpy = jest.spyOn(
      service['logger'] as { log: (message: string) => void },
      'log',
    );

    await service.sendPasswordResetEmail('user@example.com', 'secure-token');

    expect(logSpy).toHaveBeenCalledWith(
      '[MOCK SMTP] Password reset email dispatched to user@example.com with link https://app.example.com/auth/reset-password?token=secure-token',
    );
  });

  it('dispatches password reset email in production even when SMTP flag is false', async () => {
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'FRONTEND_URL') return 'https://prod.example.com/';
      if (key === 'SMTP_ENABLED') return false;
      if (key === 'NODE_ENV') return 'production';
      return undefined;
    });

    const logSpy = jest.spyOn(
      service['logger'] as { log: (message: string) => void },
      'log',
    );

    await service.sendPasswordResetEmail('user@example.com', 'prod-token');

    expect(logSpy).toHaveBeenCalledWith(
      '[MOCK SMTP] Password reset email dispatched to user@example.com with link https://prod.example.com/auth/reset-password?token=prod-token',
    );
  });
});
