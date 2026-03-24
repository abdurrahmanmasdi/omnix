import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AccessControlController } from './access-control.controller';
import { AccessControlService } from './access-control.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AccessControlController],
  providers: [AccessControlService],
  exports: [AccessControlService],
})
export class AccessControlModule {}
