import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { join } from 'path';
import { PrismaModule } from '../prisma/prisma.module';

// Note: If you created the grpc.constants.ts file earlier, you can use that here instead!
@Module({
  imports: [
    PrismaModule,
    ClientsModule.register([
      {
        name: 'RAG_PACKAGE',
        transport: Transport.GRPC,
        options: {
          package: 'rag',
          protoPath: join(__dirname, '../proto/rag.proto'),
          url: 'localhost:50051', // Your Python server
        },
      },
    ]),
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
