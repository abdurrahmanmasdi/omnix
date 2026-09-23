import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CredentialsService } from './credentials.service';
import { AuditModule } from '../audit/audit.module';

@Global()
@Module({
  imports: [PrismaModule, AuditModule],
  providers: [CredentialsService],
  exports: [CredentialsService],
})
export class CredentialsModule {}
