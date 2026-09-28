import { Module } from '@nestjs/common';
import { ExperiencesService } from './experiences.service';
import { ExperiencesController } from './experiences.controller';
import { AuthModule } from '../auth/auth.module';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { GRPC_CONFIG } from '../config/grpc.constants';

@Module({
  imports: [
    AuthModule,
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
  controllers: [ExperiencesController],
  providers: [ExperiencesService],
})
export class ExperiencesModule {}
