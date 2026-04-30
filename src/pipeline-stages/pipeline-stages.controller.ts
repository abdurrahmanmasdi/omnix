import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PipelineStage } from '@prisma/client';
import { Request as ExpressRequest } from 'express';
import { AccessVerificationService } from '../access-control/access-verification.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AppPermission } from '../constants/permissions.registry';
import { CreatePipelineStageDto } from './dtos/create-pipeline-stage.dto';
import { UpdatePipelineStageDto } from './dtos/update-pipeline-stage.dto';
import { PipelineStagesService } from './pipeline-stages.service';

interface AuthRequest extends ExpressRequest {
  user: {
    id: string;
  };
}

@ApiTags('pipeline-stages')
@ApiBearerAuth()
@Controller('organizations/:organizationId/pipeline-stages')
export class PipelineStagesController {
  constructor(
    private readonly pipelineStagesService: PipelineStagesService,
    private readonly accessVerificationService: AccessVerificationService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List organization pipeline stages' })
  @ApiResponse({ status: 200, description: 'Pipeline stages fetched' })
  async findAll(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Request() req: AuthRequest,
  ): Promise<PipelineStage[]> {
    await this.accessVerificationService.verifyUserInOrganization(
      organizationId,
      req.user.id,
    );

    return this.pipelineStagesService.findAll(organizationId);
  }

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(AppPermission.PIPELINE_STAGES_CREATE)
  @ApiOperation({ summary: 'Create organization pipeline stage' })
  @ApiResponse({ status: 201, description: 'Pipeline stage created' })
  async create(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Request() req: AuthRequest,
    @Body() dto: CreatePipelineStageDto,
  ): Promise<PipelineStage> {
    await this.accessVerificationService.verifyUserInOrganization(
      organizationId,
      req.user.id,
    );

    return this.pipelineStagesService.create(organizationId, dto);
  }

  @Patch(':stageId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(AppPermission.PIPELINE_STAGES_EDIT)
  @ApiOperation({ summary: 'Update organization pipeline stage' })
  @ApiResponse({ status: 200, description: 'Pipeline stage updated' })
  async update(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('stageId', new ParseUUIDPipe()) stageId: string,
    @Request() req: AuthRequest,
    @Body() dto: UpdatePipelineStageDto,
  ): Promise<PipelineStage> {
    await this.accessVerificationService.verifyUserInOrganization(
      organizationId,
      req.user.id,
    );

    return this.pipelineStagesService.update(organizationId, stageId, dto);
  }

  @Delete(':stageId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(AppPermission.PIPELINE_STAGES_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete organization pipeline stage' })
  @ApiResponse({ status: 204, description: 'Pipeline stage deleted' })
  async remove(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('stageId', new ParseUUIDPipe()) stageId: string,
    @Request() req: AuthRequest,
  ): Promise<void> {
    await this.accessVerificationService.verifyUserInOrganization(
      organizationId,
      req.user.id,
    );

    await this.pipelineStagesService.remove(organizationId, stageId);
  }
}
