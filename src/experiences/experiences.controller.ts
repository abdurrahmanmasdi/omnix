import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  Logger,
  Param,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { OrganizationExperience } from '@prisma/client';
import { ExperiencesService } from './experiences.service';
import { CreateExperienceDto } from './dto/create-experience.dto';
import { UpdateExperienceDto } from './dto/update-experience.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Experiences')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('experiences')
export class ExperiencesController {
  private readonly logger = new Logger(ExperiencesController.name);

  constructor(private readonly experiencesService: ExperiencesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new patient experience (social proof)',
    description:
      'Creates a new experience/testimonial for the authenticated organization. The story will be automatically embedded for AI-powered patient matching.',
  })
  @ApiBody({
    type: CreateExperienceDto,
    description: 'Experience details including story and images',
  })
  @ApiResponse({
    status: 201,
    description: 'Experience created successfully',
    schema: {
      example: {
        id: 'uuid',
        organizationId: 'org-uuid',
        title: 'Successful Hair Transplant',
        patientCountry: 'Germany',
        procedureType: 'FUE Hair Transplant',
        storyText: 'Patient had thinning hair for 5 years...',
        beforeImageUrl: 'https://example.com/before.jpg',
        afterImageUrl: 'https://example.com/after.jpg',
        embedding: null,
        createdAt: '2026-05-06T10:00:00Z',
        updatedAt: '2026-05-06T10:00:00Z',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request data or missing organization context',
    schema: {
      example: {
        statusCode: 400,
        message: 'Title must be at least 3 characters long',
        error: 'Bad Request',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - missing or invalid JWT token',
    schema: {
      example: {
        statusCode: 401,
        message: 'Unauthorized',
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
    schema: {
      example: {
        statusCode: 500,
        message: 'Failed to create experience. Please try again later.',
      },
    },
  })
  async createExperience(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateExperienceDto,
  ): Promise<OrganizationExperience> {
    try {
      if (!user.organizationId) {
        this.logger.warn(
          `User ${user.id} attempted to create experience without organization context`,
        );
        throw new BadRequestException(
          'No organization context found. Please ensure you are part of an organization.',
        );
      }

      this.logger.debug(
        `Creating experience for organization: ${user.organizationId}, user: ${user.id}`,
      );

      const experience = await this.experiencesService.createExperience(
        user.organizationId,
        dto,
      );

      this.logger.log(
        `Experience created successfully: ${experience.id} for org: ${user.organizationId}`,
      );

      return experience;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      this.logger.error(
        `Error creating experience for user ${user.id}:`,
        error,
      );

      throw new InternalServerErrorException(
        'Failed to create experience. Please try again later.',
      );
    }
  }

  @Get()
  @ApiOperation({
    summary: 'Get all experiences for the authenticated organization',
    description:
      'Retrieves all patient experiences/testimonials for the organization. Results are sorted by creation date (newest first).',
  })
  @ApiResponse({
    status: 200,
    description: 'List of experiences retrieved successfully',
    isArray: true,
    schema: {
      example: [
        {
          id: 'uuid',
          organizationId: 'org-uuid',
          title: 'Successful Hair Transplant',
          patientCountry: 'Germany',
          procedureType: 'FUE',
          storyText: 'Patient had thinning hair...',
          beforeImageUrl: 'https://example.com/before.jpg',
          afterImageUrl: 'https://example.com/after.jpg',
          embedding: null,
          createdAt: '2026-05-06T10:00:00Z',
          updatedAt: '2026-05-06T10:00:00Z',
        },
      ],
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Missing organization context',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - missing or invalid JWT token',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
  })
  async getExperiences(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OrganizationExperience[]> {
    try {
      if (!user.organizationId) {
        this.logger.warn(
          `User ${user.id} attempted to fetch experiences without organization context`,
        );
        throw new BadRequestException(
          'No organization context found. Please ensure you are part of an organization.',
        );
      }

      this.logger.debug(
        `Fetching experiences for organization: ${user.organizationId}`,
      );

      const experiences = await this.experiencesService.getExperiencesByOrg(
        user.organizationId,
      );

      this.logger.debug(
        `Retrieved ${experiences.length} experiences for org: ${user.organizationId}`,
      );

      return experiences;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      this.logger.error(
        `Error fetching experiences for user ${user.id}:`,
        error,
      );

      throw new InternalServerErrorException(
        'Failed to fetch experiences. Please try again later.',
      );
    }
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a specific experience by ID',
    description: 'Retrieves a single patient experience by its ID.',
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Experience UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Experience retrieved successfully',
    schema: {
      example: {
        id: 'uuid',
        organizationId: 'org-uuid',
        title: 'Successful Hair Transplant',
        patientCountry: 'Germany',
        procedureType: 'FUE',
        storyText: 'Patient had thinning hair...',
        beforeImageUrl: 'https://example.com/before.jpg',
        afterImageUrl: 'https://example.com/after.jpg',
        embedding: null,
        createdAt: '2026-05-06T10:00:00Z',
        updatedAt: '2026-05-06T10:00:00Z',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid organization context',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 404,
    description: 'Experience not found',
    schema: {
      example: {
        statusCode: 404,
        message: 'An object with the given ID was not found',
      },
    },
  })
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    if (!user.organizationId) {
      throw new BadRequestException(
        'No organization context found. Please ensure you are part of an organization.',
      );
    }
    return this.experiencesService.getExperienceById(user.organizationId, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update an existing experience',
    description:
      'Updates a patient experience. Any text field changes will trigger re-embedding for AI matching.',
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Experience UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiBody({
    type: UpdateExperienceDto,
    description: 'Fields to update (all optional)',
  })
  @ApiResponse({
    status: 200,
    description: 'Experience updated successfully',
    schema: {
      example: {
        id: 'uuid',
        organizationId: 'org-uuid',
        title: 'Successful Hair Transplant - Updated',
        patientCountry: 'Germany',
        procedureType: 'FUE',
        storyText: 'Updated story text...',
        beforeImageUrl: 'https://example.com/before.jpg',
        afterImageUrl: 'https://example.com/after.jpg',
        embedding: null,
        createdAt: '2026-05-06T10:00:00Z',
        updatedAt: '2026-05-06T11:00:00Z',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request data',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 404,
    description: 'Experience not found',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
  })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() updateDto: UpdateExperienceDto,
  ) {
    if (!user.organizationId) {
      throw new BadRequestException(
        'No organization context found. Please ensure you are part of an organization.',
      );
    }
    try {
      return await this.experiencesService.updateExperience(
        user.organizationId,
        id,
        updateDto,
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Error updating experience ${id}:`, error);
      throw new InternalServerErrorException(
        'Failed to update experience. Please try again later.',
      );
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete an experience',
    description: 'Permanently deletes a patient experience from the system.',
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Experience UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Experience deleted successfully',
    schema: {
      example: {
        id: 'uuid',
        organizationId: 'org-uuid',
        title: 'Successful Hair Transplant',
        patientCountry: 'Germany',
        procedureType: 'FUE',
        storyText: 'Patient had thinning hair...',
        beforeImageUrl: 'https://example.com/before.jpg',
        afterImageUrl: 'https://example.com/after.jpg',
        embedding: null,
        createdAt: '2026-05-06T10:00:00Z',
        updatedAt: '2026-05-06T10:00:00Z',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid organization context',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 404,
    description: 'Experience not found',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
  })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    if (!user.organizationId) {
      throw new BadRequestException(
        'No organization context found. Please ensure you are part of an organization.',
      );
    }
    try {
      return await this.experiencesService.deleteExperience(
        user.organizationId,
        id,
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Error deleting experience ${id}:`, error);
      throw new InternalServerErrorException(
        'Failed to delete experience. Please try again later.',
      );
    }
  }
}
