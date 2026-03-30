import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';

interface JwtPayload {
  sub: string;
  email: string;
  first_name: string;
  last_name: string;
  created_at: string;
}

interface IUserFromToken {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  created_at: Date;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<IUserFromToken> {
    return {
      id: payload.sub,
      email: payload.email,
      first_name: payload.first_name,
      last_name: payload.last_name,
      created_at: new Date(payload.created_at),
    };
  }
}
