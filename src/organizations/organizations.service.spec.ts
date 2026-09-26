import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationsService } from './organizations.service';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../auth/permission.service';

describe('OrganizationsService', () => {
  let provider: OrganizationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        { provide: PrismaService, useValue: { methodName: jest.fn() } },
        {
          provide: PermissionService,
          useValue: { has: jest.fn().mockResolvedValue(true) },
        },
      ],
      controllers: [],
    }).compile();

    provider = module.get<OrganizationsService>(OrganizationsService);
  });

  it('should be defined', () => {
    expect(provider).toBeDefined();
  });
});
