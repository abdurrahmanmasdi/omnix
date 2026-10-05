import { PlatformAccessService } from '../platform/platform-access.service';
import { UserProfileController } from './user-profile.controller';
import { UserProfileService } from './user-profile.service';
import { UserLocaleController } from './user-locale.controller';
import { Global } from '@nestjs/common';
import { UserJwtStrategy } from './jwt-user.strategy';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { PermissionService } from './permission.service';
import { InvitationsService } from './invitations.service';
import { InvitationsController } from './invitations.controller';

@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [
    AuthController,
    InvitationsController,
    UserLocaleController,
    UserProfileController,
  ],
  providers: [
    AuthService,
    PlatformAccessService,
    UserProfileService,
    JwtStrategy,
    UserJwtStrategy,
    PermissionService,
    InvitationsService,
  ],
  exports: [
    AuthService,
    PermissionService,
    InvitationsService,
    PlatformAccessService,
  ],
})
export class AuthModule {}
