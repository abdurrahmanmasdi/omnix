import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface JwtPayload {
  sub: string;
  email: string;
  organizationId: string | null;
  roleId: string | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
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
    return {
      id: payload.sub,
      email: payload.email,
      organizationId: payload.organizationId,
      roleId: payload.roleId,
    };
  }
}
