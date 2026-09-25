import { Global } from '@nestjs/common';
import { UserJwtStrategy } from './jwt-user.strategy';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { PermissionService } from './permission.service';

@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, UserJwtStrategy, PermissionService],
  exports: [AuthService, PermissionService],
})
export class AuthModule {}
