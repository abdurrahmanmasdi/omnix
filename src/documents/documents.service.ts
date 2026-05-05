import {
  Injectable,
  Inject,
  Logger,
  OnModuleInit,
  NotFoundException,
} from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom, Observable } from 'rxjs';
import * as fs from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';

// Define the gRPC Interface
interface DocumentProcessorService {
  ingestPdf(data: {
    organizationId: string;
    documentationId: string;
    fileName: string;
    filePath: string;
  }): Observable<{ success: boolean; chunksProcessed: number }>;
  deleteFile(data: {
    organizationId: string;
    fileName: string;
  }): Observable<{ success: boolean; chunksDeleted: number }>;
}

@Injectable()
export class DocumentsService implements OnModuleInit {
  private readonly logger = new Logger(DocumentsService.name);
  private ragService: DocumentProcessorService | undefined;

  constructor(
    private readonly prisma: PrismaService,
    @Inject('RAG_PACKAGE') private readonly client: ClientGrpc,
  ) {}

  onModuleInit() {
    this.ragService =
      this.client.getService<DocumentProcessorService>('DocumentProcessor');
  }

  async getDocuments(organizationId: string) {
    return this.prisma.organizationDocumentation.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async uploadDocument(organizationId: string, file: Express.Multer.File) {
    // 1. Save metadata to database with PENDING status
    const doc = await this.prisma.organizationDocumentation.create({
      data: {
        organizationId,
        fileName: file.originalname,
        filePath: file.path, // e.g., 'uploads/1234-file.pdf'
        status: 'PENDING',
      },
    });

    try {
      // 2. Call Python via gRPC to process the vectors
      const absolutePath = join(process.cwd(), file.path);

      this.logger.log(`🤖 Telling Python to ingest ${file.originalname}...`);
      await lastValueFrom(
        this.ragService!.ingestPdf({
          organizationId,
          documentationId: doc.id,
          fileName: doc.fileName,
          filePath: absolutePath,
        }),
      );

      // 3. Mark as processed!
      return this.prisma.organizationDocumentation.update({
        where: { id: doc.id },
        data: { status: 'PROCESSED' },
      });
    } catch (error) {
      this.logger.error(`Failed to process document: ${error.message}`);
      // Mark as error so the user knows it failed
      await this.prisma.organizationDocumentation.update({
        where: { id: doc.id },
        data: { status: 'ERROR' },
      });
      throw error;
    }
  }

  async deleteDocument(organizationId: string, documentId: string) {
    const doc = await this.prisma.organizationDocumentation.findFirst({
      where: { id: documentId, organizationId },
    });

    if (!doc) throw new NotFoundException('Document not found');

    // 1. Delete physical file
    try {
      await fs.unlink(join(process.cwd(), doc.filePath));
    } catch (e) {
      this.logger.warn(`File ${doc.filePath} already missing from disk.`);
    }

    // 2. Tell Python to delete the vectors (just in case Prisma Cascade fails or isn't used)
    try {
      await lastValueFrom(
        this.ragService!.deleteFile({
          organizationId,
          fileName: doc.fileName,
        }),
      );
    } catch (e) {
      this.logger.warn(
        `Failed to call Python deletion, relying on Prisma Cascade.`,
      );
    }

    // 3. Delete from Database (Prisma Cascade will wipe the vectors!)
    await this.prisma.organizationDocumentation.delete({
      where: { id: documentId },
    });

    return { success: true };
  }
}
