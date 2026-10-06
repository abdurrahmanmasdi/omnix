import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const config = {
    get: jest.fn().mockReturnValue('test-access-secret'),
  } as unknown as ConfigService;
  const payload = {
    sub: 'user-1',
    email: 'user@example.test',
    organizationId: 'org-1',
    roleId: 'role-1',
    securityVersion: 1,
  };

  it('accepts an active membership and returns the verified tenant identity', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'membership-1' });
    const strategy = new JwtStrategy(config, {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          email: payload.email,
          locale: 'AR',
          status: 'ACTIVE',
          securityVersion: 1,
          memberships: [{ id: 'membership-1' }],
        }),
      },
      organizationMembership: { findFirst },
    } as unknown as PrismaService);

    await expect(strategy.validate(payload)).resolves.toEqual({
      id: 'user-1',
      email: 'user@example.test',
      locale: 'AR',
      organizationId: 'org-1',
      roleId: 'role-1',
    });
  });

  it('rejects a valid but stale membership token', async () => {
    const strategy = new JwtStrategy(config, {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ status: 'ACTIVE', memberships: [] }),
      },
      organizationMembership: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService);

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it.each([
    ['older', { securityVersion: 1 }],
    ['missing', { securityVersion: undefined }],
  ])(
    'rejects a token with an %s security version',
    async (_label, override) => {
      const strategy = new JwtStrategy(config, {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            email: payload.email,
            locale: 'AR',
            status: 'ACTIVE',
            securityVersion: 2,
            memberships: [{ id: 'membership-1' }],
          }),
        },
      } as unknown as PrismaService);

      await expect(
        strategy.validate({ ...payload, ...override }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    },
  );
});
