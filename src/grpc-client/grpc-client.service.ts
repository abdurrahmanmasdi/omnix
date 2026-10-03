import {
  Injectable,
  Inject,
  OnModuleInit,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { Metadata } from '@grpc/grpc-js';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom, timeout, Observable } from 'rxjs';
import {
  AgentRequest,
  AgentReply,
} from '../webhooks/interfaces/agent.interface';

// We duplicate the simple RAG interfaces here for type checking
export interface IngestPdfRequest {
  organizationId: string;
  documentationId: string;
  fileName: string;
  fileContent: Buffer;
}
export interface DeleteFileRequest {
  organizationId: string;
  fileName: string;
}
export interface EmbedExperienceRequest {
  experienceId: string;
  organizationId: string;
}

interface SalesAgentService {
  generateReply(
    data: AgentRequest,
    metadata?: Metadata,
  ): Observable<AgentReply>;
}
interface DocumentProcessorService {
  ingestPdf(
    data: IngestPdfRequest,
    metadata?: Metadata,
  ): Observable<{ success: boolean; chunksProcessed: number }>;
  deleteFile(
    data: DeleteFileRequest,
    metadata?: Metadata,
  ): Observable<{ success: boolean; chunksDeleted: number }>;
  EmbedExperience(
    data: EmbedExperienceRequest,
    metadata?: Metadata,
  ): Observable<{ success: boolean; message: string }>;
}

@Injectable()
export class GrpcClientService implements OnModuleInit {
  private salesAgentService: SalesAgentService | undefined;
  private documentProcessorService: DocumentProcessorService | undefined;
  private readonly logger = new Logger(GrpcClientService.name);
  private readonly TIMEOUT_MS = 30000;

  constructor(
    @Inject('AI_AGENT_PACKAGE') private readonly agentClient: ClientGrpc,
    @Inject('RAG_PACKAGE') private readonly ragClient: ClientGrpc,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.salesAgentService =
      this.agentClient.getService<SalesAgentService>('SalesAgent');
    this.documentProcessorService =
      this.ragClient.getService<DocumentProcessorService>('DocumentProcessor');
  }

  private getMetadata(): Metadata {
    const meta = new Metadata();
    const secret = this.config.get<string>('INTERNAL_RPC_SECRET');
    if (!secret) {
      this.logger.error('INTERNAL_RPC_SECRET is not configured.');
      throw new HttpException(
        'Internal Server Error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    meta.add('authorization', `Bearer ${secret}`);
    return meta;
  }

  private async callGrpcMethod<T, D>(
    method: (data: D, metadata: Metadata) => Observable<T>,
    data: D,
  ): Promise<T> {
    try {
      return await lastValueFrom(
        method(data, this.getMetadata()).pipe(timeout(this.TIMEOUT_MS)),
      );
    } catch (error: any) {
      this.logger.error(`gRPC call failed: ${error.message}`);
      throw new HttpException(
        'Downstream service failed',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  generateReply(data: AgentRequest): Promise<AgentReply> {
    return this.callGrpcMethod(
      this.salesAgentService!.generateReply.bind(this.salesAgentService),
      data,
    );
  }

  ingestPdf(
    data: IngestPdfRequest,
  ): Promise<{ success: boolean; chunksProcessed: number }> {
    return this.callGrpcMethod(
      this.documentProcessorService!.ingestPdf.bind(
        this.documentProcessorService,
      ),
      data,
    );
  }

  deleteFile(
    data: DeleteFileRequest,
  ): Promise<{ success: boolean; chunksDeleted: number }> {
    return this.callGrpcMethod(
      this.documentProcessorService!.deleteFile.bind(
        this.documentProcessorService,
      ),
      data,
    );
  }

  EmbedExperience(
    data: EmbedExperienceRequest,
  ): Promise<{ success: boolean; message: string }> {
    return this.callGrpcMethod(
      this.documentProcessorService!.EmbedExperience.bind(
        this.documentProcessorService,
      ),
      data,
    );
  }
}
