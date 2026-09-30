import { Module, Global } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { GRPC_CONFIG } from '../config/grpc.constants';
import { GrpcClientService } from './grpc-client.service';

@Global()
@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'AI_AGENT_PACKAGE',
        transport: Transport.GRPC,
        options: {
          package: GRPC_CONFIG.PACKAGES.AGENT,
          protoPath: GRPC_CONFIG.PROTO_PATHS.AGENT,
          url: GRPC_CONFIG.PYTHON_SERVER_URL,
          credentials: process.env.NODE_ENV === 'production' 
            ? require('@grpc/grpc-js').credentials.createSsl() 
            : require('@grpc/grpc-js').credentials.createInsecure(),
        },
      },
      {
        name: 'RAG_PACKAGE',
        transport: Transport.GRPC,
        options: {
          package: GRPC_CONFIG.PACKAGES.RAG,
          protoPath: GRPC_CONFIG.PROTO_PATHS.RAG,
          url: GRPC_CONFIG.PYTHON_SERVER_URL,
          credentials: process.env.NODE_ENV === 'production' 
            ? require('@grpc/grpc-js').credentials.createSsl() 
            : require('@grpc/grpc-js').credentials.createInsecure(),
        },
      },
    ]),
  ],
  providers: [GrpcClientService],
  exports: [GrpcClientService],
})
export class GrpcClientModule {}
