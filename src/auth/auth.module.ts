import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    // Register the JwtModule. We don't set a default secret here
    // because we have different secrets for Access and Refresh tokens.
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService], // Export AuthService for use in other modules (e.g., TenantModule)
})
export class AuthModule {}
