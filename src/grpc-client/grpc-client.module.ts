import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { credentials } from '@grpc/grpc-js';
import { GRPC_CONFIG } from '../config/grpc.constants';
import { GrpcClientService } from './grpc-client.service';

// PYTHON_SERVER_URL comes from the validated config (read when the module is built,
// so a value from .env is honoured too).
const grpcClient = (name: string, pkg: string, protoPath: string) => ({
  name,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    transport: Transport.GRPC as const,
    options: {
      package: pkg,
      protoPath,
      url: config.get<string>('PYTHON_SERVER_URL') ?? 'localhost:50051',
      credentials:
        config.get<string>('NODE_ENV') === 'production'
          ? credentials.createSsl()
          : credentials.createInsecure(),
    },
  }),
});

@Global()
@Module({
  imports: [
    ClientsModule.registerAsync([
      grpcClient(
        'AI_AGENT_PACKAGE',
        GRPC_CONFIG.PACKAGES.AGENT,
        GRPC_CONFIG.PROTO_PATHS.AGENT,
      ),
      grpcClient(
        'RAG_PACKAGE',
        GRPC_CONFIG.PACKAGES.RAG,
        GRPC_CONFIG.PROTO_PATHS.RAG,
      ),
    ]),
  ],
  providers: [GrpcClientService],
  exports: [GrpcClientService],
})
export class GrpcClientModule {}
