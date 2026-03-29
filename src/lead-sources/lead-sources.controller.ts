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
import { LeadSource } from '@prisma/client';
import { Request as ExpressRequest } from 'express';
import { AccessVerificationService } from '../access-control/access-verification.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AppPermission } from '../constants/permissions.registry';
import { CreateLeadSourceDto } from './dtos/create-lead-source.dto';
import { UpdateLeadSourceDto } from './dtos/update-lead-source.dto';
import { LeadSourcesService } from './lead-sources.service';

interface AuthRequest extends ExpressRequest {
  user: {
    id: string;
  };
}

@ApiTags('lead-sources')
@ApiBearerAuth()
@Controller('organizations/:organizationId/lead-sources')
export class LeadSourcesController {
  constructor(
    private readonly leadSourcesService: LeadSourcesService,
    private readonly accessVerificationService: AccessVerificationService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List organization lead sources' })
  @ApiResponse({ status: 200, description: 'Lead sources fetched' })
  async findAll(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Request() req: AuthRequest,
  ): Promise<LeadSource[]> {
    await this.accessVerificationService.verifyUserInOrganization(
      organizationId,
      req.user.id,
    );

    return this.leadSourcesService.findAll(organizationId);
  }

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(AppPermission.LEAD_SOURCES_CREATE)
  @ApiOperation({ summary: 'Create organization lead source' })
  @ApiResponse({ status: 201, description: 'Lead source created' })
  async create(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Request() req: AuthRequest,
    @Body() dto: CreateLeadSourceDto,
  ): Promise<LeadSource> {
    await this.accessVerificationService.verifyUserInOrganization(
      organizationId,
      req.user.id,
    );

    return this.leadSourcesService.create(organizationId, dto);
  }

  @Patch(':sourceId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(AppPermission.LEAD_SOURCES_EDIT)
  @ApiOperation({ summary: 'Update organization lead source' })
  @ApiResponse({ status: 200, description: 'Lead source updated' })
  async update(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('sourceId', new ParseUUIDPipe()) sourceId: string,
    @Request() req: AuthRequest,
    @Body() dto: UpdateLeadSourceDto,
  ): Promise<LeadSource> {
    await this.accessVerificationService.verifyUserInOrganization(
      organizationId,
      req.user.id,
    );

    return this.leadSourcesService.update(organizationId, sourceId, dto);
  }

  @Delete(':sourceId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(AppPermission.LEAD_SOURCES_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete organization lead source' })
  @ApiResponse({ status: 204, description: 'Lead source deleted' })
  async remove(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('sourceId', new ParseUUIDPipe()) sourceId: string,
    @Request() req: AuthRequest,
  ): Promise<void> {
    await this.accessVerificationService.verifyUserInOrganization(
      organizationId,
      req.user.id,
    );

    await this.leadSourcesService.remove(organizationId, sourceId);
  }
}
