import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseInterceptors,
  UploadedFile,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
  ApiTags,
} from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { extname } from 'path';

import { DocumentsService } from './documents.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Documents')
@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  @ApiOperation({
    summary: 'Get all knowledge base documents for the organization',
  })
  @ApiResponse({ status: 200, description: 'List of documents' })
  async getDocuments(@CurrentUser() user: AuthenticatedUser) {
    if (!user.organizationId) {
      throw new BadRequestException('Organization not found for the user');
    }
    return this.documentsService.getDocuments(user.organizationId);
  }

  @Post('upload')
  @ApiOperation({ summary: 'Upload a new PDF to train the AI' })
  @ApiConsumes('multipart/form-data') // Tells Swagger it's a file upload
  @ApiBody({ type: UploadDocumentDto }) // Attaches the DTO we made
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads', // Ensure this folder exists in your backend root!
        filename: (req, file, cb) => {
          // Save as a secure UUID to prevent filename collisions
          cb(null, `${uuidv4()}${extname(file.originalname)}`);
        },
      }),
      limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB limit
      },
      fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
          cb(null, true);
        } else {
          cb(new BadRequestException('Only PDF files are allowed.'), false);
        }
      },
    }),
  )
  async uploadDocument(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!user.organizationId) {
      throw new BadRequestException('Organization not found for the user');
    }
    return this.documentsService.uploadDocument(user.organizationId, file);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a document and its associated vectors' })
  @ApiResponse({ status: 200, description: 'Document deleted successfully' })
  async deleteDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') documentId: string,
  ) {
    if (!user.organizationId) {
      throw new BadRequestException('Organization not found for the user');
    }
    return this.documentsService.deleteDocument(
      user.organizationId,
      documentId,
    );
  }
}
