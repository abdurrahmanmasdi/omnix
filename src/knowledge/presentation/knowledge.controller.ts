import {
  Controller,
  Headers,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadKnowledgeUseCase } from '../application/use-cases/upload-knowledge.use-case';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Request as ExpressRequest } from 'express';

interface AuthRequest extends ExpressRequest {
  user?: {
    id?: string;
  };
}

@Controller('knowledge')
@UseGuards(JwtAuthGuard)
export class KnowledgeController {
  constructor(
    private readonly uploadKnowledgeUseCase: UploadKnowledgeUseCase,
  ) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: AuthRequest,
    @Headers('x-organization-id') organizationId: string,
  ): Promise<any> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException('Only PDF files are allowed');
    }

    if (!organizationId) {
      throw new BadRequestException(
        'Organization context missing from user session',
      );
    }

    const userId = req.user?.id;

    if (!userId) {
      throw new BadRequestException('User context missing from session');
    }

    return this.uploadKnowledgeUseCase.execute(file, organizationId, userId);
  }
}
