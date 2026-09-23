import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { LeadsService } from './leads.service';
import {
  CreateLeadDto,
  FindLeadsQueryDto,
  UpdateLeadDto,
  UpdateLeadStageDto,
} from './dtos/lead.dto';
import {
  LeadResponseDto,
  LeadsPaginatedResponseDto,
} from './dtos/lead-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Leads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('leads:manage')
  @ApiOperation({ summary: 'Create a new lead' })
  @ApiBody({ type: CreateLeadDto })
  @ApiResponse({
    status: 201,
    description: 'Lead created successfully',
    schema: {
      example: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        organizationId: 'org-uuid',
        firstName: 'John',
        lastName: 'Doe',
        phoneNumber: '+905551234567',
        country: 'Turkey',
        timezone: 'Europe/Istanbul',
        primaryLanguage: 'en',
        preferredLanguage: 'ar',
        nativeName: 'Can',
        email: 'john@example.com',
        socialLinks: { instagram: '@johndoe' },
        gender: 'MALE',
        status: 'NEW',
        priority: 'WARM',
        estimatedValue: 5000,
        currency: 'USD',
        expectedServiceDate: '2026-06-01T00:00:00Z',
        nextFollowUpAt: '2026-05-10T10:00:00Z',
        createdAt: '2026-05-09T10:00:00Z',
        updatedAt: '2026-05-09T10:00:00Z',
        deletedAt: null,
        sourceId: 'source-uuid',
        pipelineStageId: 'stage-uuid',
        assignedAgentId: 'agent-uuid',
        assignedAgent: {
          id: 'agent-uuid',
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@example.com',
        },
        source: {
          id: 'source-uuid',
          name: 'Meta Ads',
          isActive: true,
        },
        pipelineStage: {
          id: 'stage-uuid',
          orderIndex: 1,
          name: 'New',
        },
        conversation: {
          id: 'conv-uuid',
          status: 'ACTIVE',
          createdAt: '2026-05-09T10:00:00Z',
          updatedAt: '2026-05-09T10:00:00Z',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request data',
    schema: {
      example: {
        statusCode: 400,
        message: 'Invalid or inactive Lead Source',
        error: 'Bad Request',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
  })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateLeadDto) {
    if (!user.organizationId)
      throw new UnauthorizedException('Organization context missing');
    return this.leadsService.create(user.organizationId, dto);
  }

  @Get()
  @RequirePermissions('leads:view')
  @ApiOperation({
    summary: 'Get leads with dynamic filtering and sorting',
    description:
      'Retrieves all leads with support for filters, sorting, and pagination via AST query builder',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    example: 1,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    example: 20,
    description: 'Items per page, max 100 (default: 20)',
  })
  @ApiQuery({
    name: 'filters',
    required: false,
    type: String,
    example: '[{"field":"status","operator":"eq","value":"NEW"}]',
    description: 'JSON AST filter array',
  })
  @ApiQuery({
    name: 'sorts',
    required: false,
    type: String,
    example: '[{"field":"createdAt","direction":"DESC"}]',
    description: 'JSON AST sort array',
  })
  @ApiResponse({
    status: 200,
    description: 'Leads retrieved successfully with pagination metadata',
    type: LeadsPaginatedResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
  })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() filters: FindLeadsQueryDto,
  ) {
    if (!user.organizationId)
      throw new UnauthorizedException('Organization context missing');
    return this.leadsService.findAll(user.organizationId, user.id, filters);
  }

  @Get(':id')
  @RequirePermissions('leads:view')
  @ApiOperation({ summary: 'Get a specific lead by ID' })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Lead UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Lead retrieved successfully',
    schema: {
      example: {
        id: 'lead-uuid',
        organizationId: 'org-uuid',
        firstName: 'John',
        lastName: 'Doe',
        phoneNumber: '+905551234567',
        email: 'john@example.com',
        country: 'Turkey',
        status: 'NEW',
        priority: 'WARM',
        estimatedValue: 5000,
        assignedAgent: {
          id: 'agent-uuid',
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@example.com',
        },
        conversation: {
          id: 'conv-uuid',
          status: 'ACTIVE',
          createdAt: '2026-05-09T10:00:00Z',
          updatedAt: '2026-05-09T10:00:00Z',
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 404,
    description: 'Lead not found',
    schema: {
      example: {
        statusCode: 404,
        message: 'Lead not found',
        error: 'Not Found',
      },
    },
  })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    if (!user.organizationId)
      throw new UnauthorizedException('Organization context missing');
    return this.leadsService.findOne(user.organizationId, user.id, id);
  }

  @Patch(':id/stage')
  @RequirePermissions('leads:manage')
  @ApiOperation({
    summary: 'Update the pipeline stage and optionally the status of a lead',
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Lead UUID',
  })
  @ApiBody({ type: UpdateLeadStageDto })
  @ApiResponse({
    status: 200,
    description: 'Lead stage updated successfully',
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
    description: 'Lead not found',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
  })
  updateStage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateLeadStageDto,
  ) {
    if (!user.organizationId)
      throw new UnauthorizedException('Organization context missing');
    return this.leadsService.updateStage(user.organizationId, user.id, id, dto);
  }

  @Patch(':id')
  @RequirePermissions('leads:manage')
  @ApiOperation({ summary: 'Update a specific lead' })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Lead UUID',
  })
  @ApiBody({ type: UpdateLeadDto })
  @ApiResponse({
    status: 200,
    description: 'Lead updated successfully',
    schema: {
      example: {
        id: 'lead-uuid',
        firstName: 'John',
        lastName: 'Doe Updated',
        status: 'QUALIFYING',
        priority: 'HOT',
        updatedAt: '2026-05-09T11:00:00Z',
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
    description: 'Lead not found',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
  })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateLeadDto,
  ) {
    if (!user.organizationId)
      throw new UnauthorizedException('Organization context missing');
    return this.leadsService.update(user.organizationId, user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('leads:manage')
  @ApiOperation({ summary: 'Soft delete a lead' })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Lead UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Lead deleted successfully',
    schema: {
      example: {
        id: 'lead-uuid',
        message: 'Lead soft deleted',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 404,
    description: 'Lead not found',
  })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    if (!user.organizationId)
      throw new UnauthorizedException('Organization context missing');
    return this.leadsService.remove(user.organizationId, user.id, id);
  }
}
