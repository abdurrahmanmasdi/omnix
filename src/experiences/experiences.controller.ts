import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { OrganizationExperience } from '@prisma/client';
import { ExperiencesService } from './experiences.service';
import { CreateExperienceDto } from './dto/create-experience.dto';
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
    summary:
      'Create a new experience (social proof) for the authenticated organization',
  })
  @ApiResponse({
    status: 201,
    description: 'Experience created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request data or missing organization context',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - missing or invalid authentication',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
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
  })
  @ApiResponse({
    status: 200,
    description: 'List of experiences retrieved successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Missing organization context',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - missing or invalid authentication',
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
}
