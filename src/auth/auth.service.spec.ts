import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../auth/permission.service';

describe('AuthService Refresh Token Logic', () => {
  let authService: AuthService;
  let mockPrisma: any;
  let mockJwt: any;

  beforeEach(async () => {
    mockPrisma = {
      $transaction: jest.fn((cb) => cb(mockPrisma)),
      session: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
    };

    mockJwt = {
      verify: jest.fn().mockReturnValue({ familyId: 'fam1', nonce: 'nonce1' }),
      decode: jest
        .fn()
        .mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 }),
      sign: jest.fn().mockReturnValue('token'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('secret') },
        },
        {
          provide: PermissionService,
          useValue: { has: jest.fn().mockResolvedValue(true) },
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  it('old-token reuse revokes the new family', async () => {
    // Simulate reuse: session found, but isRevoked = true
    mockPrisma.session.findFirst.mockResolvedValue({
      id: 's1',
      isRevoked: true,
    });
    mockPrisma.session.updateMany.mockResolvedValue({ count: 1 });

    await expect(authService.refreshTokens('token')).rejects.toThrow(
      'Session revoked due to token reuse',
    );
    expect(mockPrisma.session.updateMany).toHaveBeenCalledWith({
      where: { familyId: 'fam1', isRevoked: false },
      data: expect.objectContaining({
        isRevoked: true,
        revokedReason: 'Reused token detected (revoked session presented)',
      }),
    });
  });

  it('concurrent refresh race condition revokes family if count is 0', async () => {
    // Simulate valid session initially found
    mockPrisma.session.findFirst.mockResolvedValue({
      id: 's1',
      isRevoked: false,
      expiresAt: new Date(Date.now() + 10000),
      userId: 'u1',
    });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      status: 'ACTIVE',
      memberships: [{ organizationId: 'o1', roleId: 'r1' }],
    });

    // Simulate someone else updating the same row concurrently (compare-and-set returns 0)
    mockPrisma.session.updateMany.mockResolvedValueOnce({ count: 0 }); // First updateMany (rotate) fails
    mockPrisma.session.updateMany.mockResolvedValueOnce({ count: 1 }); // Second updateMany (revoke family) succeeds

    await expect(authService.refreshTokens('token')).rejects.toThrow(
      'Session revoked due to concurrent token reuse',
    );
    expect(mockPrisma.session.updateMany).toHaveBeenCalledWith({
      where: { id: 's1', isRevoked: false },
      data: expect.objectContaining({
        isRevoked: true,
        revokedReason: 'Rotated',
      }),
    });
    expect(mockPrisma.session.updateMany).toHaveBeenCalledWith({
      where: { familyId: 'fam1' },
      data: expect.objectContaining({
        isRevoked: true,
        revokedReason: 'Concurrent reuse detected',
      }),
    });
  });

  it('rejects suspended users', async () => {
    mockPrisma.session.findFirst.mockResolvedValue({
      id: 's1',
      isRevoked: false,
      expiresAt: new Date(Date.now() + 10000),
      userId: 'u1',
    });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      status: 'SUSPENDED',
      memberships: [],
    });

    await expect(authService.refreshTokens('token')).rejects.toThrow(
      'User account is not active',
    );
  });

  it('uses exact expiry from decoded token', async () => {
    mockPrisma.session.findFirst.mockResolvedValue({
      id: 's1',
      isRevoked: false,
      expiresAt: new Date(Date.now() + 10000),
      userId: 'u1',
    });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      status: 'ACTIVE',
      memberships: [{ organizationId: 'o1', roleId: 'r1' }],
    });
    mockPrisma.session.updateMany.mockResolvedValue({ count: 1 });

    const expTime = Math.floor(Date.now() / 1000) + 86400; // 1 day
    mockJwt.decode.mockReturnValue({ exp: expTime });

    await authService.refreshTokens('token');

    expect(mockPrisma.session.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          expiresAt: new Date(expTime * 1000),
        }),
      }),
    );
  });
});
