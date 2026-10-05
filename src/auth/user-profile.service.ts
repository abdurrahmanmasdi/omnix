import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { UserLocale } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { tenantStorage } from '../core/tenant/tenant.context';
import {
  ChangePasswordDto,
  UpdateUserProfileDto,
  UserProfileDto,
} from './dto/user-profile.dto';

@Injectable()
export class UserProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // Account-level operation: every read/write is explicitly limited to authenticated self.
  private system<T>(fn: () => Promise<T>) {
    return tenantStorage.run({ isSystemBypass: true }, fn);
  }
  get(userId: string): Promise<UserProfileDto> {
    return this.system(async () => {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phoneNumber: true,
          whatsappNumber: true,
          spokenLanguages: true,
          locale: true,
          memberships: {
            where: { deletedAt: null },
            include: {
              organization: { select: { name: true } },
              role: { select: { name: true } },
            },
          },
        },
      });
      if (!user) throw new UnauthorizedException();
      return {
        ...user,
        memberships: user.memberships.map((m) => ({
          organizationId: m.organizationId,
          organizationName: m.organization.name,
          roleName: m.role.name,
          status: m.status,
        })),
      };
    });
  }
  async update(userId: string, dto: UpdateUserProfileDto) {
    // IsOptional permits null: explicitly reject it rather than clearing required fields.
    if (Object.values(dto).some((value) => value === null))
      throw new BadRequestException('Profile fields cannot be null');
    const data: {
      firstName?: string;
      lastName?: string;
      phoneNumber?: string | null;
      whatsappNumber?: string | null;
      spokenLanguages?: string[];
      locale?: UserLocale;
    } = {};
    for (const field of [
      'firstName',
      'lastName',
      'spokenLanguages',
      'locale',
    ] as const) {
      if (dto[field] !== undefined)
        Object.assign(data, { [field]: dto[field] });
    }
    if (dto.phoneNumber !== undefined)
      data.phoneNumber = dto.phoneNumber || null;
    if (dto.whatsappNumber !== undefined)
      data.whatsappNumber = dto.whatsappNumber || null;
    await this.system(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: userId }, data });
        const memberships = await tx.organizationMembership.findMany({
          where: { userId, status: 'ACTIVE', deletedAt: null },
        });
        if (Object.keys(data).length)
          await tx.auditLog.createMany({
            data: (memberships.length
              ? memberships
              : [{ organizationId: null }]
            ).map((m) => ({
              organizationId: m.organizationId,
              actor: userId,
              action: 'PROFILE_UPDATED',
              targetId: userId,
              metadata: { fields: Object.keys(data) },
            })),
          });
      }),
    );
    return this.get(userId);
  }
  async changePassword(
    userId: string,
    org: string | null,
    cookie: string | undefined,
    dto: ChangePasswordDto,
  ) {
    let payload: { familyId: string; nonce: string };
    try {
      payload = this.jwt.verify(cookie ?? '', {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('A current refresh session is required');
    }
    if (!payload.familyId || !payload.nonce) throw new UnauthorizedException();
    const tokenHash = createHash('sha256').update(payload.nonce).digest('hex');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (
      !user ||
      !(await bcrypt.compare(dto.currentPassword, user.password_hash))
    )
      throw new UnauthorizedException({
        code: 'CURRENT_PASSWORD_INVALID',
        message: 'Current password is incorrect',
      });
    const password_hash = await bcrypt.hash(dto.newPassword, 12);
    return this.system(() =>
      this.prisma.$transaction(async (tx) => {
        // Same per-user lock as refresh: revoked sessions cannot race into new credentials.
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
        const liveUser = await tx.user.findUnique({ where: { id: userId } });
        if (
          !liveUser ||
          liveUser.securityVersion !== user.securityVersion ||
          liveUser.status !== 'ACTIVE' ||
          liveUser.deletedAt
        )
          throw new ConflictException('Account changed; retry');
        const session = await tx.session.findFirst({
          where: {
            userId,
            familyId: payload.familyId,
            tokenHash,
            expiresAt: { gt: new Date() },
          },
        });
        const inGrace =
          session?.revokedReason === 'Rotated' &&
          session.revokedAt &&
          Date.now() - session.revokedAt.getTime() <= 10_000;
        const liveFamily = await tx.session.count({
          where: {
            userId,
            familyId: payload.familyId,
            isRevoked: false,
            expiresAt: { gt: new Date() },
          },
        });
        if (!session || (session.isRevoked && !inGrace) || !liveFamily)
          throw new UnauthorizedException('Current session is revoked');
        await tx.user.update({
          where: { id: userId },
          data: { password_hash, securityVersion: { increment: 1 } },
        });
        await tx.session.updateMany({
          where: {
            userId,
            familyId: { not: payload.familyId },
            isRevoked: false,
          },
          data: {
            isRevoked: true,
            revokedAt: new Date(),
            revokedReason: 'Password changed',
          },
        });
        const memberships = await tx.organizationMembership.findMany({
          where: { userId, status: 'ACTIVE', deletedAt: null },
        });
        await tx.auditLog.createMany({
          data: (memberships.length
            ? memberships
            : [{ organizationId: null }]
          ).map((m) => ({
            organizationId: m.organizationId,
            actor: userId,
            action: 'PASSWORD_CHANGED',
            targetId: userId,
            metadata: { fields: ['password'] },
          })),
        });
        const membership = memberships.find((m) => m.organizationId === org);
        return {
          access_token: this.jwt.sign(
            {
              sub: userId,
              email: user.email,
              organizationId: membership?.organizationId ?? null,
              roleId: membership?.roleId ?? null,
              securityVersion: user.securityVersion + 1,
            },
            {
              secret: this.config.get<string>('JWT_ACCESS_SECRET'),
              expiresIn: this.config.get('JWT_ACCESS_EXPIRATION'),
            },
          ),
        };
      }),
    );
  }
}
