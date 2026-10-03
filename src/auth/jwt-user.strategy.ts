import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { hasCurrentSecurityVersion } from './security-version';

export interface JwtPayload {
  sub: string;
  email: string;
  organizationId: string | null;
  roleId: string | null;
  securityVersion?: number;
}

@Injectable()
export class UserJwtStrategy extends PassportStrategy(Strategy, 'jwt-user') {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_ACCESS_SECRET')!,
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.deletedAt) {
      throw new UnauthorizedException('User account is deleted');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException(
        'User account is not active. Please accept your pilot invitation.',
      );
    }

    if (
      !hasCurrentSecurityVersion(payload.securityVersion, user.securityVersion)
    ) {
      throw new UnauthorizedException(
        'Session revoked due to security changes',
      );
    }

    // Return the database fields instead of trusting the token payload
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
      organizationId: payload.organizationId,
      roleId: payload.roleId,
    };
  }
}
