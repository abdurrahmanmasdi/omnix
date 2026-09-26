import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MembershipStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { tenantStorage } from '../core/tenant/tenant.context';

export interface JwtPayload {
  sub: string;
  email: string;
  organizationId: string | null;
  roleId: string | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    // 1. Tell Passport how to extract and verify the token
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false, // Automatically reject expired tokens
      secretOrKey: configService.get<string>('JWT_ACCESS_SECRET')!,
    });
  }

  // 2. If the token is mathematically valid and not expired, this runs.
  // Whatever we return here is automatically injected into `req.user` for all our controllers!
  async validate(payload: JwtPayload) {
    // A signed token is not sufficient authorization: memberships may have
    // been revoked, deactivated, or reassigned after token issuance.
    if (!payload.organizationId || !payload.roleId) {
      throw new UnauthorizedException(
        'An active organization membership is required',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        memberships: {
          where: {
            organizationId: payload.organizationId,
            roleId: payload.roleId,
            status: MembershipStatus.ACTIVE,
            deletedAt: null,
          },
        },
      },
    });

    if (!user || user.status === 'PENDING' || user.status === 'SUSPENDED') {
      throw new UnauthorizedException('User account is not active');
    }

    if (user.memberships.length === 0) {
      throw new UnauthorizedException('Organization membership is inactive');
    }

    // Replace middleware's decoded-token context with the verified identity.
    // This keeps Prisma tenant filtering tied to the authenticated membership.
    tenantStorage.enterWith({
      organizationId: payload.organizationId,
      isSystemBypass: false,
    });

    return {
      id: payload.sub,
      email: payload.email,
      organizationId: payload.organizationId,
      roleId: payload.roleId,
    };
  }
}
