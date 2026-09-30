import { Module } from '@nestjs/common';

import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { PrismaModule } from '../prisma/prisma.module';
import { GRPC_CONFIG } from '../config/grpc.constants';

// Note: If you created the grpc.constants.ts file earlier, you can use that here instead!
@Module({
  imports: [
    PrismaModule,
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
