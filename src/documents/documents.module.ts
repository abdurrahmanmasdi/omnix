import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { join } from 'path';
import { PrismaModule } from '../prisma/prisma.module';
import { GRPC_CONFIG } from '../config/grpc.constants';

// Note: If you created the grpc.constants.ts file earlier, you can use that here instead!
@Module({
  imports: [
    PrismaModule,
    ClientsModule.register([
      {
        name: 'RAG_PACKAGE',
        transport: Transport.GRPC,
        options: {
          package: GRPC_CONFIG.PACKAGES.RAG,
          protoPath: GRPC_CONFIG.PROTO_PATHS.RAG,
          url: GRPC_CONFIG.PYTHON_SERVER_URL,
        },
      },
    ]),
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
