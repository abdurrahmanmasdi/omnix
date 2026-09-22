import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
  Inject,
} from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom, Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExperienceDto } from './dto/create-experience.dto';
import { UpdateExperienceDto } from './dto/update-experience.dto';
import { Prisma, OrganizationExperience } from '@prisma/client';

// Define the gRPC interface
interface DocumentProcessorService {
  EmbedExperience(data: {
    experienceId: string;
    organizationId: string;
  }): Observable<{ success: boolean; message: string }>;
}

@Injectable()
export class ExperiencesService implements OnModuleInit {
  private ragService: DocumentProcessorService | undefined;
  private readonly logger = new Logger(ExperiencesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject('RAG_PACKAGE') private readonly client: ClientGrpc,
  ) {}

  onModuleInit() {
    this.ragService =
      this.client.getService<DocumentProcessorService>('DocumentProcessor');
  }

  async createExperience(
    organizationId: string,
    dto: CreateExperienceDto,
  ): Promise<OrganizationExperience> {
    try {
      // Validate organizationId format
      if (!organizationId || organizationId.trim() === '') {
        this.logger.warn(
          'Attempted to create experience with invalid organizationId',
        );
        throw new BadRequestException('Organization ID must be a valid UUID');
      }

      // Verify organization exists
      const organization = await this.prisma.organization.findUnique({
        where: { id: organizationId },
      });

      if (!organization) {
        this.logger.warn(
          `Attempted to create experience for non-existent organization: ${organizationId}`,
        );
        throw new NotFoundException(
          'Organization not found. Please verify you have access to this organization.',
        );
      }

      // Validate required fields
      if (!dto.title || dto.title.trim() === '') {
        throw new BadRequestException('Experience title is required');
      }

      if (!dto.storyText || dto.storyText.trim() === '') {
        throw new BadRequestException('Experience story text is required');
      }

      this.logger.debug(
        `Creating experience for organization ${organizationId} with title: ${dto.title}`,
      );

      const experience = await this.prisma.organizationExperience.create({
        data: {
          organizationId,
          title: dto.title.trim(),
          patientCountry: dto.patientCountry?.trim() || null,
          procedureType: dto.procedureType?.trim() || null,
          storyText: dto.storyText.trim(),
          beforeImageUrl: dto.beforeImageUrl?.trim() || null,
          afterImageUrl: dto.afterImageUrl?.trim() || null,
          consentObtained: dto.consentObtained ?? false,
        },
      });

      this.logger.log(`Experience created successfully: ${experience.id}`);

      console.log(`Firing gRPC to embed experience ${experience.id}...`);
      const response = await lastValueFrom(
        this.ragService!.EmbedExperience({
          experienceId: experience.id,
          organizationId: organizationId,
        }),
      );

      if (!response.success) {
        console.error('Python failed to embed experience:', response.message);
      } else {
        console.log('✅ Python successfully embedded the experience.');
      }

      return experience;
    } catch (error) {
      // Handle Prisma-specific errors
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        this.logger.error(
          `Prisma error creating experience: ${error.code} - ${error.message}`,
        );

        if (error.code === 'P2003') {
          throw new BadRequestException(
            'Invalid organization reference. Please ensure the organization exists.',
          );
        }

        throw new InternalServerErrorException(
          'Database error occurred while creating experience',
        );
      }

      // Re-throw our custom exceptions
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      // Log unexpected errors
      this.logger.error(
        `Unexpected error creating experience for org ${organizationId}:`,
        error,
      );

      throw new InternalServerErrorException(
        'Failed to create experience. An unexpected error occurred.',
      );
    }
  }

  async getExperiencesByOrg(
    organizationId: string,
  ): Promise<OrganizationExperience[]> {
    try {
      // Validate organizationId format
      if (!organizationId || organizationId.trim() === '') {
        this.logger.warn(
          'Attempted to fetch experiences with invalid organizationId',
        );
        throw new BadRequestException('Organization ID must be a valid UUID');
      }

      // Verify organization exists
      const organization = await this.prisma.organization.findUnique({
        where: { id: organizationId },
      });

      if (!organization) {
        this.logger.warn(
          `Attempted to fetch experiences for non-existent organization: ${organizationId}`,
        );
        throw new NotFoundException(
          'Organization not found. Please verify you have access to this organization.',
        );
      }

      this.logger.debug(
        `Fetching experiences for organization: ${organizationId}`,
      );

      const experiences = await this.prisma.organizationExperience.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
      });

      this.logger.debug(
        `Retrieved ${experiences.length} experiences for org: ${organizationId}`,
      );

      return experiences;
    } catch (error) {
      // Handle Prisma-specific errors
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        this.logger.error(
          `Prisma error fetching experiences: ${error.code} - ${error.message}`,
        );

        throw new InternalServerErrorException(
          'Database error occurred while fetching experiences',
        );
      }

      // Re-throw our custom exceptions
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      // Log unexpected errors
      this.logger.error(
        `Unexpected error fetching experiences for org ${organizationId}:`,
        error,
      );

      throw new InternalServerErrorException(
        'Failed to fetch experiences. An unexpected error occurred.',
      );
    }
  }

  async getExperienceById(organizationId: string, experienceId: string) {
    return this.prisma.organizationExperience.findUnique({
      where: { id: experienceId, organizationId },
    });
  }

  async updateExperience(
    organizationId: string,
    experienceId: string,
    dto: UpdateExperienceDto,
  ) {
    // 1. Update the database via Prisma
    const updatedExperience = await this.prisma.organizationExperience.update({
      where: { id: experienceId, organizationId },
      data: {
        ...(dto.title && { title: dto.title.trim() }),
        ...(dto.patientCountry && {
          patientCountry: dto.patientCountry.trim(),
        }),
        ...(dto.procedureType && { procedureType: dto.procedureType.trim() }),
        ...(dto.storyText && { storyText: dto.storyText.trim() }),
        ...(dto.beforeImageUrl && {
          beforeImageUrl: dto.beforeImageUrl.trim(),
        }),
        ...(dto.afterImageUrl && { afterImageUrl: dto.afterImageUrl.trim() }),
        ...(dto.consentObtained !== undefined && {
          consentObtained: dto.consentObtained,
        }),
      },
    });

    // 2. 🚀 If any text fields changed, we MUST recalculate the AI Vector
    if (dto.consentObtained === false) {
      // T12: When consent changes from true to false, remove/disable its embedding
      await this.prisma.$executeRaw`UPDATE organization_experiences SET embedding = NULL WHERE id = ${experienceId}::uuid`;
      this.logger.log(`Cleared embedding for revoked consent on ${experienceId}`);
    } else if ((dto.title || dto.storyText || dto.patientCountry || dto.procedureType) && dto.consentObtained === true) {
      console.log(
        `Text changed for ${experienceId}. Re-firing gRPC to update vector...`,
      );
      try {
        const response = await lastValueFrom(
          this.ragService!.EmbedExperience({
            experienceId: experienceId,
            organizationId: organizationId,
          }),
        );
        if (!response.success)
          console.error('Python failed to re-embed:', response.message);
      } catch (error) {
        console.error('gRPC Error updating vector:', error);
      }
    }

    return updatedExperience;
  }

  async deleteExperience(organizationId: string, experienceId: string) {
    // We don't need to tell Python about deletes. Prisma removes the row,
    // and the vector is deleted automatically because it lives in that row!
    return this.prisma.organizationExperience.delete({
      where: { id: experienceId, organizationId },
    });
  }
}
