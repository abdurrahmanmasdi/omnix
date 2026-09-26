import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  GoneException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async signup(): Promise<never> {
    throw new ForbiddenException(
      'This pilot is invitation-only. Contact your pilot operator for access.',
    );
  }

  async verifyEmail(): Promise<never> {
    // Legacy JWTs share an access-token secret and are not single-use capabilities.
    throw new GoneException(
      'Email verification is unavailable during the pilot. Use an operator invitation.',
    );
  }

  async login(loginDto: LoginDto, userAgent?: string, ip?: string) {
    const user = await this.prisma.user.findFirst({
      where: { email: loginDto.email },
      include: {
        memberships: {
          where: { status: 'ACTIVE', deletedAt: null },
          orderBy: { createdAt: 'asc' },
          include: { role: true },
        },
      },
    });

    if (!user || user.status !== 'ACTIVE' || user.deletedAt)
      throw new UnauthorizedException('Invalid credentials');

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password_hash,
    );
    if (!isPasswordValid)
      throw new UnauthorizedException('Invalid credentials');

    // Deterministic organization selection: oldest active membership
    const activeMembership = user.memberships[0];
    const organizationId = activeMembership?.organizationId || null;
    const roleId = activeMembership?.roleId || null;

    return this.generateTokens(
      user.id,
      user.email,
      organizationId,
      roleId,
      user.firstName,
      user.lastName,
      userAgent,
      ip,
    );
  }

  async refreshTokens(refreshToken: string, userAgent?: string, ip?: string) {
    let payload: { familyId?: string; nonce?: string };
    try {
      // 1. Verify the token signature mathematically
      payload = this.jwtService.verify<{ familyId?: string; nonce?: string }>(
        refreshToken,
        {
          secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        },
      );
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const { familyId, nonce } = payload;
    if (
      typeof familyId !== 'string' ||
      !familyId ||
      typeof nonce !== 'string' ||
      !nonce
    ) {
      throw new UnauthorizedException('Invalid refresh token payload');
    }

    const tokenHash = crypto.createHash('sha256').update(nonce).digest('hex');

    // Atomic refresh: lookup, validate, revoke old, create new — all in one tx
    const txResult = await this.prisma.$transaction(async (tx) => {
      const session = await tx.session.findFirst({
        where: { familyId, tokenHash },
      });

      if (!session) {
        // Token not found -> already rotated -> REUSE DETECTED
        await tx.session.updateMany({
          where: { familyId },
          data: {
            isRevoked: true,
            revokedAt: new Date(),
            revokedReason: 'Reused token detected',
          },
        });
        return { error: 'Session revoked due to token reuse' };
      }

      if (session.isRevoked) {
        // A revoked token being presented -> REUSE DETECTED -> revoke whole family
        await tx.session.updateMany({
          where: { familyId, isRevoked: false },
          data: {
            isRevoked: true,
            revokedAt: new Date(),
            revokedReason: 'Reused token detected (revoked session presented)',
          },
        });
        return { error: 'Session revoked due to token reuse' };
      }

      if (session.expiresAt < new Date()) {
        return { error: 'Session expired' };
      }

      const user = await tx.user.findUnique({
        where: { id: session.userId },
        include: {
          memberships: {
            where: { status: 'ACTIVE', deletedAt: null },
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (!user) return { error: 'User not found' };
      if (user.status !== 'ACTIVE' || user.deletedAt) {
        return { error: 'User account is not active' };
      }

      // Deterministic selection
      const activeMembership = user.memberships[0];
      const organizationId = activeMembership?.organizationId || null;
      const roleId = activeMembership?.roleId || null;

      // Revoke old session atomically using compare-and-set
      const updateResult = await tx.session.updateMany({
        where: { id: session.id, isRevoked: false },
        data: {
          isRevoked: true,
          revokedAt: new Date(),
          revokedReason: 'Rotated',
        },
      });

      // If count is 0, someone else rotated it concurrently!
      if (updateResult.count === 0) {
        await tx.session.updateMany({
          where: { familyId },
          data: {
            isRevoked: true,
            revokedAt: new Date(),
            revokedReason: 'Concurrent reuse detected',
          },
        });
        return { error: 'Session revoked due to concurrent token reuse' };
      }

      // Generate new tokens (session creation also happens inside tx)
      return this.generateTokens(
        user.id,
        user.email,
        organizationId,
        roleId,
        user.firstName,
        user.lastName,
        userAgent,
        ip,
        familyId,
        tx,
      );
    });

    if (txResult && 'error' in txResult) {
      throw new UnauthorizedException(txResult.error);
    }

    return txResult;
  }

  async logout(refreshToken: string) {
    if (!refreshToken) return;
    try {
      const payload = this.jwtService.verify<{
        familyId?: string;
        nonce?: string;
      }>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
      const { familyId, nonce } = payload;
      if (
        typeof familyId === 'string' &&
        familyId &&
        typeof nonce === 'string' &&
        nonce
      ) {
        const tokenHash = crypto
          .createHash('sha256')
          .update(nonce)
          .digest('hex');
        await this.prisma.session.updateMany({
          where: { familyId, tokenHash, isRevoked: false },
          data: {
            isRevoked: true,
            revokedAt: new Date(),
            revokedReason: 'Logout',
          },
        });
      }
    } catch {
      // Ignore if token is already invalid
    }
  }

  async generateTokens(
    userId: string,
    email: string,
    organizationId: string | null,
    roleId: string | null,
    firstName: string,
    lastName: string,
    userAgent?: string,
    ip?: string,
    existingFamilyId?: string,
    txClient?: any,
  ) {
    const tx = txClient || this.prisma;
    const payload = {
      sub: userId,
      email,
      organizationId,
      roleId,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),

      expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRATION') as any,
    });

    // Create session
    const familyId = existingFamilyId || crypto.randomUUID();
    const nonce = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(nonce).digest('hex');

    const refreshPayload = {
      familyId,
      nonce,
    };

    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),

      expiresIn: this.configService.get<string>(
        'JWT_REFRESH_EXPIRATION',
      ) as any,
    });

    const decodedRefresh = this.jwtService.decode(refreshToken);
    const expiresAt = new Date(decodedRefresh.exp * 1000);

    await tx.session.create({
      data: {
        userId,
        familyId,
        tokenHash,
        expiresAt,
        deviceMetadata: { userAgent, ip },
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: userId,
        firstName,
        lastName,
        organizationId,
        hasCompletedOnboarding: !!organizationId, // Useful boolean for your frontend!
      },
    };
  }
}
