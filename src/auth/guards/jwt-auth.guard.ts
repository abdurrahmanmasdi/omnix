import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
// We extend the built-in AuthGuard and tell it to use our 'jwt' strategy
export class JwtAuthGuard extends AuthGuard('jwt') {}
