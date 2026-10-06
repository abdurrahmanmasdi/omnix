import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlatformService } from './platform.service';
import { PlatformController } from './platform.controller';
import { PlatformAdminGuard } from './platform-admin.guard';
import { PlatformThrottlerGuard } from './platform-throttler.guard';
@Module({
  imports: [AuthModule],
  controllers: [PlatformController],
  providers: [PlatformService, PlatformAdminGuard, PlatformThrottlerGuard],
})
export class PlatformModule {}
