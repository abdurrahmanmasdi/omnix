import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExperienceDto } from './dto/create-experience.dto';
import { Prisma, OrganizationExperience } from '@prisma/client';

@Injectable()
export class ExperiencesService {
  private readonly logger = new Logger(ExperiencesService.name);

  constructor(private readonly prisma: PrismaService) {}

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
        },
      });

      this.logger.log(`Experience created successfully: ${experience.id}`);
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
}
