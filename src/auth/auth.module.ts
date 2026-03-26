import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { AuthService } from './auth.service';
import { PermissionsService } from './services/permissions.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PermissionsGuard } from './guards/permissions.guard';
import { jwtConstants } from './constants';
import { AuthController } from './auth.controller';
import { GlobalAuthGuard } from './guards/global-auth.guard';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: jwtConstants.secret,
      signOptions: { expiresIn: '1d' },
    }),
  ],
  providers: [
    AuthService,
    PermissionsService,
    JwtStrategy,
    GlobalAuthGuard,
    PermissionsGuard,
  ],
  exports: [AuthService, PermissionsService, GlobalAuthGuard, PermissionsGuard],
  controllers: [AuthController],
})
export class AuthModule {}
