import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { AuthService } from './auth.service';
import { PermissionsService } from './services/permissions.service';
import { TokenManagementService } from './services/token-management.service';
import { MailingService } from './services/mailing.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PermissionsGuard } from './guards/permissions.guard';
import { AuthController } from './auth.controller';
import { GlobalAuthGuard } from './guards/global-auth.guard';

@Global()
@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1d' },
      }),
    }),
  ],
  providers: [
    AuthService,
    PermissionsService,
    TokenManagementService,
    MailingService,
    JwtStrategy,
    GlobalAuthGuard,
    PermissionsGuard,
  ],
  exports: [
    AuthService,
    PermissionsService,
    TokenManagementService,
    MailingService,
    GlobalAuthGuard,
    PermissionsGuard,
  ],
  controllers: [AuthController],
})
export class AuthModule {}
