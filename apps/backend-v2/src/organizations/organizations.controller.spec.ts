import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { AuthService } from '../auth/auth.service';
import { PermissionService } from '../auth/permission.service';

describe('OrganizationsController', () => {
  let provider: OrganizationsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsController,
        { provide: OrganizationsService, useValue: { methodName: jest.fn() } },
        { provide: AuthService, useValue: { methodName: jest.fn() } },
        {
          provide: PermissionService,
          useValue: { has: jest.fn().mockResolvedValue(true) },
        },
      ],
      controllers: [OrganizationsController],
    }).compile();

    provider = module.get<OrganizationsController>(OrganizationsController);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
});
