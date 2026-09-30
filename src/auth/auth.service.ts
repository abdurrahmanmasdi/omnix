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
import { tenantStorage } from '../core/tenant/tenant.context';
import { LoginDto } from './dto/login.dto';
import { ConsumeRecoveryDto } from './dto/consume-recovery.dto';

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


    let organizationId: string | null = null;
    let roleId: string | null = null;

    if (loginDto.organizationId) {
      const requestedMembership = user.memberships.find(m => m.organizationId === loginDto.organizationId);
      if (!requestedMembership) {
        throw new UnauthorizedException('Membership not found or inactive');
      }
      organizationId = requestedMembership.organizationId;
      roleId = requestedMembership.roleId;
    } else if (user.memberships.length === 1) {
      organizationId = user.memberships[0].organizationId;
      roleId = user.memberships[0].roleId;
    }


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


  async issueRecovery(email: string, operator: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user || user.deletedAt || user.status !== 'ACTIVE') {
      throw new Error('Account is not active or suspended. Cannot issue recovery token.');
    }
    const tokenBytes = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(`PASSWORD_RECOVERY:${tokenBytes}`).digest('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour expiry
    
    await this.prisma.accountInvitation.create({
      data: {
        userId: user.id,
        tokenHash,
        purpose: 'PASSWORD_RECOVERY',
        issuedBy: operator,
        expiresAt,
      }
    });
    return { token: tokenBytes };
  }


  async consumeRecovery(dto: ConsumeRecoveryDto) {
    const tokenHash = crypto.createHash('sha256').update(`PASSWORD_RECOVERY:${dto.token}`).digest('hex');
    
    await tenantStorage.run({ isSystemBypass: true }, async () => {
      await this.prisma.$transaction(async (tx) => {
        const invitation = await tx.accountInvitation.findUnique({
          where: { tokenHash },
          include: { user: true }
        });
        if (!invitation || invitation.purpose !== 'PASSWORD_RECOVERY' || invitation.consumedAt || invitation.revokedAt || invitation.expiresAt < new Date()) {
          throw new UnauthorizedException('Recovery token is invalid, expired, or already used.');
        }
        if (invitation.user.deletedAt || invitation.user.status !== 'ACTIVE') {
          throw new UnauthorizedException('Account is suspended or deleted.');
        }
        
        const password_hash = await bcrypt.hash(dto.newPassword, 12);
        
        await tx.user.update({
          where: { id: invitation.userId },
          data: {
            password_hash,
            securityVersion: { increment: 1 }
          }
        });
        
        await tx.session.updateMany({
          where: { userId: invitation.userId, isRevoked: false },
          data: { isRevoked: true, revokedAt: new Date(), revokedReason: 'Password Reset' }
        });
        
        await tx.accountInvitation.update({
          where: { id: invitation.id },
          data: { consumedAt: new Date() }
        });
        
        const activeMemberships = await tx.organizationMembership.findMany({
          where: { userId: invitation.userId, status: 'ACTIVE', deletedAt: null }
        });
        
        if (activeMemberships.length > 0) {
          await tx.auditLog.createMany({
            data: activeMemberships.map(m => ({
              organizationId: m.organizationId,
              action: 'ACCOUNT_RECOVERY',
              actor: invitation.userId,
              metadata: { issuedBy: invitation.issuedBy }
            }))
          });
        }
      });
    });
  }

  async refreshTokens(refreshToken: string, userAgent?: string, ip?: string, requestedOrganizationId?: string) {
    let payload: { familyId?: string; nonce?: string; org?: string | null };
    try {
      // 1. Verify the token signature mathematically
      payload = this.jwtService.verify<{ familyId?: string; nonce?: string; org?: string | null }>(
        refreshToken,
        {
          secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        },
      );
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const { familyId, nonce, org } = payload;
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
            include: { role: true },
          },
        },
      });

      if (!user || user.status !== 'ACTIVE' || user.deletedAt) {
        return { error: 'User account is not active' };
      }

      let organizationId: string | null = null;
      let roleId: string | null = null;

      const targetOrgId = requestedOrganizationId !== undefined ? requestedOrganizationId : org;

      if (targetOrgId) {
        const mem = user.memberships.find(m => m.organizationId === targetOrgId);
        if (mem) {
          organizationId = mem.organizationId;
          roleId = mem.roleId;
        } else if (requestedOrganizationId !== undefined) {
          return { error: 'Requested organization not found or inactive' };
        }
        // If they didn't request a new one and the old one is inactive, we fall back to null
      } else if (user.memberships.length === 1 && requestedOrganizationId === undefined) {
        organizationId = user.memberships[0].organizationId;
        roleId = user.memberships[0].roleId;
      }

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
    const userRow = await tx.user.findUnique({ where: { id: userId }, select: { securityVersion: true } });
    
    const payload = {
      sub: userId,
      email,
      organizationId,
      roleId,
      securityVersion: userRow?.securityVersion ?? 1,
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
      org: organizationId,
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
