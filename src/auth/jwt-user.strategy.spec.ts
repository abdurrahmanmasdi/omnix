import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { UserJwtStrategy } from './jwt-user.strategy';

describe('UserJwtStrategy', () => {
  const config = {
    get: jest.fn().mockReturnValue('test-access-secret'),
  } as unknown as ConfigService;
  const payload = {
    sub: 'user-1',
    email: 'user@example.test',
    organizationId: null,
    roleId: null,
  };
  const strategyFor = (user: Record<string, unknown> | null) =>
    new UserJwtStrategy(config, {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
    } as unknown as PrismaService);
  const activeUser = {
    id: 'user-1',
    email: 'user@example.test',
    firstName: 'Ada',
    lastName: 'Staff',
    status: 'ACTIVE',
    deletedAt: null,
    securityVersion: 2,
  };

  it('accepts a token carrying the current security version', async () => {
    await expect(
      strategyFor(activeUser).validate({ ...payload, securityVersion: 2 }),
    ).resolves.toMatchObject({ id: 'user-1', status: 'ACTIVE' });
  });

  it('rejects a token issued before account recovery bumped the security version', async () => {
    await expect(
      strategyFor(activeUser).validate({ ...payload, securityVersion: 1 }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token without a security version', async () => {
    await expect(
      strategyFor(activeUser).validate(payload),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
