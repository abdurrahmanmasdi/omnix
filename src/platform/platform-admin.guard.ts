import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PlatformAccessService } from './platform-access.service';
@Injectable()
export class PlatformAdminGuard extends AuthGuard('jwt-user') {
  constructor(private readonly access: PlatformAccessService) {
    super();
  }
  handleRequest<TUser = { id: string; email: string; status: string }>(
    err: unknown,
    user: TUser,
  ): TUser {
    const identity = user as { email: string; status: string } | undefined;
    if (err || !identity || !this.access.allows(identity))
      throw new NotFoundException();
    return user;
  }
}
