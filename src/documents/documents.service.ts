import {
  Injectable,
  Inject,
  Logger,
  OnModuleInit,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { GrpcClientService } from '../grpc-client/grpc-client.service';
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
    fileContent: Buffer;
  }): Observable<{ success: boolean; chunksProcessed: number }>;
  deleteFile(data: {
    organizationId: string;
    fileName: string;
  }): Observable<{ success: boolean; chunksDeleted: number }>;
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly grpcClient: GrpcClientService,
  ) {}


  async getDocuments(organizationId: string) {
    return this.prisma.organizationDocumentation.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async uploadDocument(organizationId: string, file: Express.Multer.File) {
    const fs = require('fs');
    const buffer = Buffer.alloc(4);
    const fd = fs.openSync(file.path, 'r');
    fs.readSync(fd, buffer, 0, 4, 0);
    fs.closeSync(fd);

    if (buffer.toString('hex') !== '25504446') {
      fs.unlinkSync(file.path);
      throw new Error(
        'Invalid file signature. Only actual PDF files are allowed.',
      );
    }

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

      this.logger.log(`DOCUMENT_INGEST_STARTED documentId=${doc.id}`);

      const fileBuffer = await fs.readFile(absolutePath);

      const result = await 
        this.grpcClient.ingestPdf({
          organizationId,
          documentationId: doc.id,
          fileName: doc.fileName,
          fileContent: fileBuffer,
        });

      if (!result || !result.success) {
        throw new Error('Python AI engine returned an unsuccessful response.');
      }

      // 3. Mark as processed!
      return await this.prisma.organizationDocumentation.update({
        where: { id: doc.id },
        data: { status: 'PROCESSED' },
      });
    } catch (error: any) {
      this.logger.error(`DOCUMENT_INGEST_FAILED documentId=${doc.id}`);
      // Mark as error so the user knows it failed
      await this.prisma.organizationDocumentation.update({
        where: { id: doc.id },
        data: { status: 'ERROR' },
      });
      throw new InternalServerErrorException(
        'Failed to process document in the AI engine.',
        { cause: error },
      );
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
    } catch {
      this.logger.warn(`DOCUMENT_FILE_MISSING documentId=${doc.id}`);
    }

    // 2. Tell Python to delete the vectors (just in case Prisma Cascade fails or isn't used)
    try {
      await 
        this.grpcClient.deleteFile({
          organizationId,
          fileName: doc.fileName,
        });
    } catch {
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
