import { Module } from '@nestjs/common';
import { ExperiencesService } from './experiences.service';
import { ExperiencesController } from './experiences.controller';
import { AuthModule } from '../auth/auth.module';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';

@Module({
  imports: [
    AuthModule,
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
  controllers: [ExperiencesController],
  providers: [ExperiencesService],
})
export class ExperiencesModule {}
