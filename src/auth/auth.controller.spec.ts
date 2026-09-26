import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PermissionService } from '../auth/permission.service';

describe('AuthController', () => {
  let provider: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthController,
        { provide: AuthService, useValue: { methodName: jest.fn() } },
        {
          provide: PermissionService,
          useValue: { has: jest.fn().mockResolvedValue(true) },
        },
      ],
      controllers: [AuthController],
    }).compile();

    provider = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
});
