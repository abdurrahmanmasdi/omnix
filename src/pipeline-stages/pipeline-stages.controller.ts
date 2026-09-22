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
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { PipelineStagesService } from './pipeline-stages.service';
import {
  CreatePipelineStageDto,
  UpdatePipelineStageDto,
  BulkReorderStagesDto,
} from './dtos/pipeline-stage.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Pipeline Stages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('pipeline-stages')
export class PipelineStagesController {
  constructor(private readonly pipelineStagesService: PipelineStagesService) {}

  @RequirePermissions('pipeline:manage')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new pipeline stage (Kanban column)' })
  @ApiBody({ type: CreatePipelineStageDto })
  @ApiResponse({
    status: 201,
    description: 'Pipeline stage created successfully',
    schema: {
      example: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        organizationId: 'org-uuid',
        name: 'Initial Contact',
        orderIndex: 0,
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
    @Body() dto: CreatePipelineStageDto,
  ) {
    if (!user.organizationId)
      throw new UnauthorizedException('Organization context missing');
    return this.pipelineStagesService.create(user.organizationId, dto);
  }

  @RequirePermissions('pipeline:view')
  @Get()
  @ApiOperation({
    summary: 'Get all pipeline stages ordered by index',
    description: 'Retrieves all pipeline stages for the organization in order',
  })
  @ApiResponse({
    status: 200,
    description: 'Pipeline stages retrieved successfully',
    schema: {
      example: [
        {
          id: 'stage-uuid-1',
          organizationId: 'org-uuid',
          name: 'Initial Contact',
          orderIndex: 0,
          createdAt: '2026-05-09T10:00:00Z',
          updatedAt: '2026-05-09T10:00:00Z',
          deletedAt: null,
        },
        {
          id: 'stage-uuid-2',
          organizationId: 'org-uuid',
          name: 'Qualifying',
          orderIndex: 1,
          createdAt: '2026-05-09T10:00:00Z',
          updatedAt: '2026-05-09T10:00:00Z',
          deletedAt: null,
        },
        {
          id: 'stage-uuid-3',
          organizationId: 'org-uuid',
          name: 'Negotiation',
          orderIndex: 2,
          createdAt: '2026-05-09T10:00:00Z',
          updatedAt: '2026-05-09T10:00:00Z',
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
    return this.pipelineStagesService.findAll(user.organizationId);
  }

  @RequirePermissions('pipeline:view')
  @Get(':id')
  @ApiOperation({ summary: 'Get a specific pipeline stage' })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Pipeline Stage UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Pipeline stage retrieved successfully',
    schema: {
      example: {
        id: 'stage-uuid',
        organizationId: 'org-uuid',
        name: 'Initial Contact',
        orderIndex: 0,
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
    description: 'Pipeline stage not found',
    schema: {
      example: {
        statusCode: 404,
        message: 'Pipeline stage not found',
        error: 'Not Found',
      },
    },
  })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    if (!user.organizationId)
      throw new UnauthorizedException('Organization context missing');
    return this.pipelineStagesService.findOne(user.organizationId, id);
  }

  @RequirePermissions('pipeline:manage')
  @Patch('reorder')
  @ApiOperation({
    summary: 'Bulk reorder pipeline stages (Drag & Drop)',
    description:
      'Updates the orderIndex for multiple stages at once, useful for Kanban board reordering',
  })
  @ApiBody({ type: BulkReorderStagesDto })
  @ApiResponse({
    status: 200,
    description: 'Pipeline stages reordered successfully',
    schema: {
      example: [
        {
          id: 'stage-uuid-1',
          name: 'Initial Contact',
          orderIndex: 2,
          updatedAt: '2026-05-09T11:00:00Z',
        },
        {
          id: 'stage-uuid-2',
          name: 'Qualifying',
          orderIndex: 1,
          updatedAt: '2026-05-09T11:00:00Z',
        },
        {
          id: 'stage-uuid-3',
          name: 'Negotiation',
          orderIndex: 0,
          updatedAt: '2026-05-09T11:00:00Z',
        },
      ],
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request data or stage IDs',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
  })
  reorder(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkReorderStagesDto,
  ) {
    if (!user.organizationId)
      throw new UnauthorizedException('Organization context missing');
    return this.pipelineStagesService.reorder(user.organizationId, dto);
  }

  @RequirePermissions('pipeline:manage')
  @Patch(':id')
  @ApiOperation({ summary: 'Update a pipeline stage name or index' })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Pipeline Stage UUID',
  })
  @ApiBody({ type: UpdatePipelineStageDto })
  @ApiResponse({
    status: 200,
    description: 'Pipeline stage updated successfully',
    schema: {
      example: {
        id: 'stage-uuid',
        name: 'Initial Contact Updated',
        orderIndex: 1,
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
    description: 'Pipeline stage not found',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
  })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdatePipelineStageDto,
  ) {
    if (!user.organizationId)
      throw new UnauthorizedException('Organization context missing');
    return this.pipelineStagesService.update(user.organizationId, id, dto);
  }

  @RequirePermissions('pipeline:manage')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft delete a pipeline stage' })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Pipeline Stage UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Pipeline stage deleted successfully',
    schema: {
      example: {
        id: 'stage-uuid',
        message: 'Pipeline stage soft deleted',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 404,
    description: 'Pipeline stage not found',
  })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    if (!user.organizationId)
      throw new UnauthorizedException('Organization context missing');
    return this.pipelineStagesService.remove(user.organizationId, id);
  }
}
