import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { KnowledgeEnginePort } from '../../application/ports/knowledge-engine.port';
import * as FormData from 'form-data';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class PythonKnowledgeEngineAdapter implements KnowledgeEnginePort {
  private readonly logger = new Logger(PythonKnowledgeEngineAdapter.name);

  constructor(private readonly httpService: HttpService) {}

  async uploadDocument(
    file: Express.Multer.File,
    organizationId: string,
  ): Promise<any> {
    const formData = new FormData();

    formData.append('organization_id', organizationId);
    formData.append('file', file.buffer, { filename: file.originalname });

    const pythonEngineUrl =
      process.env.PYTHON_ENGINE_URL || 'http://localhost:8000';
    const internalSecret = process.env.INTERNAL_MICROSERVICE_KEY;

    try {
      this.logger.log(
        `Forwarding ${file.originalname} to AI Engine for org ${organizationId}...`,
      );

      const response = await lastValueFrom(
        this.httpService.post(
          `${pythonEngineUrl}/api/v1/knowledge/upload`,
          formData,
          {
            headers: {
              ...formData.getHeaders(),
              'X-Internal-Secret': internalSecret,
            },
          },
        ),
      );

      return response.data;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown AI engine error';
      this.logger.error(`AI Engine failed to process PDF: ${errorMessage}`);
      throw new InternalServerErrorException(
        'AI Engine failed to process the document.',
      );
    }
  }
}
