import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { grpcClientTransport } from './grpc-transport';
import { GRPC_CONFIG } from '../config/grpc.constants';
import { GrpcClientService } from './grpc-client.service';

// PYTHON_SERVER_URL and the transport settings come from the validated config (read
// when the module is built, so a value from .env is honoured too).
const grpcClient = (name: string, pkg: string, protoPath: string) => ({
  name,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    // INTERNAL_GRPC_TLS decides (not NODE_ENV); misconfiguration stops startup (KI-002).
    const transport = grpcClientTransport((key) => config.get<string>(key));
    return {
      transport: Transport.GRPC as const,
      options: {
        package: pkg,
        protoPath,
        url: config.get<string>('PYTHON_SERVER_URL') ?? 'localhost:50051',
        credentials: transport.credentials,
        channelOptions: transport.channelOptions,
      },
    };
  },
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
  exports: [GrpcClientService, ClientsModule],
})
export class GrpcClientModule {}
