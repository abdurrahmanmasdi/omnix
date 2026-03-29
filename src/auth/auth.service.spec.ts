import { BadRequestException, NotFoundException } from '@nestjs/common';
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
    organizationMembership: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
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

  it('should sign and return access token with permissions on login', async () => {
    const createdAt = new Date();
    const user = {
      id: 'u1',
      email: 'user@example.com',
      first_name: 'A',
      last_name: 'B',
      created_at: createdAt,
    };

    // Mock membership with role and permissions
    mockPrisma.organizationMembership.findFirst.mockResolvedValue({
      id: 'membership-1',
      user_id: 'u1',
      organization_id: 'org-1',
      status: 'ACTIVE',
      role: {
        rolePermissions: [
          { permission: { action: 'leads:read' } },
          { permission: { action: 'leads:create' } },
        ],
      },
    });

    // Mock no overrides
    mockPrisma.membershipPermissionOverride.findMany.mockResolvedValue([]);

    mockJwtService.sign.mockReturnValue('jwt-token');

    const result = await service.login(user);

    expect(mockJwtService.sign).toHaveBeenCalledWith({
      sub: 'u1',
      email: 'user@example.com',
    });
    expect(result).toEqual({
      access_token: 'jwt-token',
      user: {
        ...user,
        permissions: ['leads:create', 'leads:read'],
      },
    });
  });

  it('should return empty permissions if user has no active membership on login', async () => {
    const createdAt = new Date();
    const user = {
      id: 'u1',
      email: 'user@example.com',
      first_name: 'A',
      last_name: 'B',
      created_at: createdAt,
    };

    mockPrisma.organizationMembership.findFirst.mockResolvedValue(null);
    mockJwtService.sign.mockReturnValue('jwt-token');

    const result = await service.login(user);

    expect(result).toEqual({
      access_token: 'jwt-token',
      user: {
        ...user,
        permissions: [],
      },
    });
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

    await expect(
      service.register('user@example.com', 'secret', 'A', 'B'),
    ).resolves.toEqual({
      id: 'u1',
      email: 'user@example.com',
      first_name: 'A',
      last_name: 'B',
      created_at: createdAt,
    });

    expect(bcrypt.hash).toHaveBeenCalledWith('secret', 10);
    expect(mockPrisma.user.create).toHaveBeenCalledWith({
      data: {
        email: 'user@example.com',
        password_hash: 'hashed-password',
        first_name: 'A',
        last_name: 'B',
      },
    });
  });

  it('should consume invitation token and create active membership during register', async () => {
    const createdAt = new Date();
    mockPrisma.user.findUnique.mockResolvedValue(null);
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-password' as never);
    mockPrisma.invitation.findFirst.mockResolvedValue({
      id: 'invite-1',
      email: 'user@example.com',
      status: 'pending',
      organization_id: 'org-1',
      role_id: 'role-1',
    });
    mockPrisma.invitation.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.user.create.mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
      password_hash: 'hashed-password',
      first_name: 'A',
      last_name: 'B',
      created_at: createdAt,
    });
    mockPrisma.organizationMembership.create.mockResolvedValue({ id: 'm1' });

    await expect(
      service.register('user@example.com', 'secret', 'A', 'B', 'token-123'),
    ).resolves.toEqual({
      id: 'u1',
      email: 'user@example.com',
      first_name: 'A',
      last_name: 'B',
      created_at: createdAt,
    });

    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(mockPrisma.invitation.findFirst).toHaveBeenCalledWith({
      where: { token: 'token-123' },
      select: {
        id: true,
        email: true,
        status: true,
        organization_id: true,
        role_id: true,
      },
    });
    expect(mockPrisma.invitation.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'invite-1',
        status: 'pending',
      },
      data: {
        status: 'accepted',
        accepted_at: expect.any(Date) as Date,
      },
    });
    expect(mockPrisma.organizationMembership.create).toHaveBeenCalledWith({
      data: {
        user_id: 'u1',
        organization_id: 'org-1',
        role_id: 'role-1',
        status: 'ACTIVE',
      },
    });
  });

  it('should throw NotFoundException when invite token does not exist during register', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-password' as never);
    mockPrisma.invitation.findFirst.mockResolvedValue(null);

    await expect(
      service.register('user@example.com', 'secret', 'A', 'B', 'missing-token'),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw BadRequestException when invite token email does not match register email', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-password' as never);
    mockPrisma.invitation.findFirst.mockResolvedValue({
      id: 'invite-1',
      email: 'different@example.com',
      status: 'pending',
      organization_id: 'org-1',
      role_id: 'role-1',
    });

    await expect(
      service.register('user@example.com', 'secret', 'A', 'B', 'token-123'),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException when invite token status is not pending during register', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-password' as never);
    mockPrisma.invitation.findFirst.mockResolvedValue({
      id: 'invite-1',
      email: 'user@example.com',
      status: 'accepted',
      organization_id: 'org-1',
      role_id: 'role-1',
    });

    await expect(
      service.register('user@example.com', 'secret', 'A', 'B', 'token-123'),
    ).rejects.toThrow(BadRequestException);
  });

  it('should calculate effective permissions from role permissions with overrides', async () => {
    mockPrisma.organizationMembership.findFirst.mockResolvedValue({
      id: 'membership-1',
      user_id: 'u1',
      organization_id: 'org-1',
      role: {
        rolePermissions: [
          { permission: { action: 'leads:read' } },
          { permission: { action: 'leads:create' } },
          { permission: { action: 'leads:delete' } },
        ],
      },
    });

    // Override: revoke delete, grant update
    mockPrisma.membershipPermissionOverride.findMany.mockResolvedValue([
      { permission: { action: 'leads:delete' }, is_granted: false },
      { permission: { action: 'leads:update' }, is_granted: true },
    ]);

    const result = await service.getEffectivePermissions('u1', 'org-1');

    expect(result).toEqual(['leads:create', 'leads:read', 'leads:update']);
  });

  it('should return empty array if user has no membership', async () => {
    mockPrisma.organizationMembership.findFirst.mockResolvedValue(null);

    const result = await service.getEffectivePermissions('u1', 'org-1');

    expect(result).toEqual([]);
  });

  it('should sort permissions alphabetically', async () => {
    mockPrisma.organizationMembership.findFirst.mockResolvedValue({
      id: 'membership-1',
      user_id: 'u1',
      organization_id: 'org-1',
      role: {
        rolePermissions: [
          { permission: { action: 'zebra:action' } },
          { permission: { action: 'apple:action' } },
          { permission: { action: 'middle:action' } },
        ],
      },
    });

    mockPrisma.membershipPermissionOverride.findMany.mockResolvedValue([]);

    const result = await service.getEffectivePermissions('u1', 'org-1');

    expect(result).toEqual(['apple:action', 'middle:action', 'zebra:action']);
  });

  it('should return empty array when organizationId is not provided', async () => {
    const result = await service.getEffectivePermissions('u1', '');

    expect(result).toEqual([]);
    expect(mockPrisma.organizationMembership.findFirst).not.toHaveBeenCalled();
  });

  it('should return empty array and not query overrides if organizationId is null', async () => {
    // @ts-expect-error - testing null case
    const result = await service.getEffectivePermissions('u1', null);

    expect(result).toEqual([]);
    expect(mockPrisma.organizationMembership.findFirst).not.toHaveBeenCalled();
  });
});
