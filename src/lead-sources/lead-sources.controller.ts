import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { LeadSourcesService } from './lead-sources.service';
import { CreateLeadSourceDto } from './dtos/create-lead-source.dto';
import { UpdateLeadSourceDto } from './dtos/update-lead-source.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Lead Sources')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('lead-sources')
export class LeadSourcesController {
  constructor(private readonly leadSourcesService: LeadSourcesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new lead source' })
  @ApiBody({ type: CreateLeadSourceDto })
  @ApiResponse({
    status: 201,
    description: 'Lead source created successfully',
    schema: {
      example: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        organizationId: 'org-uuid',
        name: 'Meta Ads',
        isActive: true,
        createdAt: '2026-05-09T10:00:00Z',
        updatedAt: '2026-05-09T10:00:00Z',
        deletedAt: null,
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
    status: 500,
    description: 'Internal server error',
  })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateLeadSourceDto,
  ) {
    if (!user.organizationId)
      throw new UnauthorizedException('Organization context missing');
    return this.leadSourcesService.create(user.organizationId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all lead sources for organization',
    description: 'Retrieves all active and inactive lead sources',
  })
  @ApiResponse({
    status: 200,
    description: 'Lead sources retrieved successfully',
    schema: {
      example: [
        {
          id: 'source-uuid-1',
          organizationId: 'org-uuid',
          name: 'Meta Ads',
          isActive: true,
          createdAt: '2026-05-09T10:00:00Z',
          updatedAt: '2026-05-09T10:00:00Z',
          deletedAt: null,
        },
        {
          id: 'source-uuid-2',
          organizationId: 'org-uuid',
          name: 'Google Ads',
          isActive: false,
          createdAt: '2026-05-08T10:00:00Z',
          updatedAt: '2026-05-09T11:00:00Z',
          deletedAt: null,
        },
      ],
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
  findAll(@CurrentUser() user: AuthenticatedUser) {
    if (!user.organizationId)
      throw new UnauthorizedException('Organization context missing');
    return this.leadSourcesService.findAll(user.organizationId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific lead source by ID' })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Lead Source UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Lead source retrieved successfully',
    schema: {
      example: {
        id: 'source-uuid',
        organizationId: 'org-uuid',
        name: 'Meta Ads',
        isActive: true,
        createdAt: '2026-05-09T10:00:00Z',
        updatedAt: '2026-05-09T10:00:00Z',
        deletedAt: null,
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 404,
    description: 'Lead source not found',
    schema: {
      example: {
        statusCode: 404,
        message: 'Lead source not found',
        error: 'Not Found',
      },
    },
  })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    if (!user.organizationId)
      throw new UnauthorizedException('Organization context missing');
    return this.leadSourcesService.findOne(user.organizationId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a specific lead source' })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Lead Source UUID',
  })
  @ApiBody({ type: UpdateLeadSourceDto })
  @ApiResponse({
    status: 200,
    description: 'Lead source updated successfully',
    schema: {
      example: {
        id: 'source-uuid',
        name: 'Meta Ads Updated',
        isActive: false,
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
    description: 'Lead source not found',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
  })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateLeadSourceDto,
  ) {
    if (!user.organizationId)
      throw new UnauthorizedException('Organization context missing');
    return this.leadSourcesService.update(user.organizationId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft delete a lead source' })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Lead Source UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Lead source deleted successfully',
    schema: {
      example: {
        id: 'source-uuid',
        message: 'Lead source soft deleted',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 404,
    description: 'Lead source not found',
  })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    if (!user.organizationId)
      throw new UnauthorizedException('Organization context missing');
    return this.leadSourcesService.remove(user.organizationId, id);
  }
}
