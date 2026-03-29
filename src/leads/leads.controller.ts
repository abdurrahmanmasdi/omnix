import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Lead, LeadStatus, Priority } from '@prisma/client';
import { Request as ExpressRequest } from 'express';
import { AccessVerificationService } from '../access-control/access-verification.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AppPermission } from '../constants/permissions.registry';
import { CreateLeadDto } from './dtos/create-lead.dto';
import { UpdateLeadDto } from './dtos/update-lead.dto';
import { FindLeadsResult, LeadsService } from './leads.service';

interface AuthRequest extends ExpressRequest {
  user: {
    id: string;
  };
}

@ApiTags('leads')
@ApiBearerAuth()
@Controller('organizations/:organizationId/leads')
export class LeadsController {
  constructor(
    private readonly leadsService: LeadsService,
    private readonly accessVerificationService: AccessVerificationService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a lead in an organization' })
  @ApiResponse({ status: 201, description: 'Lead created successfully' })
  async create(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Request() req: AuthRequest,
    @Body() dto: CreateLeadDto,
  ): Promise<Lead> {
    await this.accessVerificationService.verifyUserInOrganization(
      organizationId,
      req.user.id,
    );

    return this.leadsService.create(organizationId, req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List leads in organization with pagination' })
  @ApiResponse({ status: 200, description: 'Leads fetched successfully' })
  async findAll(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Request() req: AuthRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('filters') filters?: string,
    @Query('status', new ParseEnumPipe(LeadStatus, { optional: true }))
    status?: LeadStatus,
    @Query('priority', new ParseEnumPipe(Priority, { optional: true }))
    priority?: Priority,
  ): Promise<FindLeadsResult> {
    await this.accessVerificationService.verifyUserInOrganization(
      organizationId,
      req.user.id,
    );

    return this.leadsService.findAll(organizationId, req.user.id, {
      page,
      limit,
      filters,
      status,
      priority,
    });
  }

  @Get(':leadId')
  @ApiOperation({ summary: 'Get a single lead from an organization' })
  @ApiResponse({ status: 200, description: 'Lead fetched successfully' })
  @ApiResponse({ status: 404, description: 'Lead not found' })
  async findOne(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('leadId', new ParseUUIDPipe()) leadId: string,
    @Request() req: AuthRequest,
  ): Promise<Lead> {
    await this.accessVerificationService.verifyUserInOrganization(
      organizationId,
      req.user.id,
    );

    return this.leadsService.findOne(organizationId, req.user.id, leadId);
  }

  @Patch(':leadId')
  @ApiOperation({ summary: 'Update a lead in an organization' })
  @ApiResponse({ status: 200, description: 'Lead updated successfully' })
  @ApiResponse({ status: 404, description: 'Lead not found' })
  async update(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('leadId', new ParseUUIDPipe()) leadId: string,
    @Request() req: AuthRequest,
    @Body() dto: UpdateLeadDto,
  ): Promise<Lead> {
    await this.accessVerificationService.verifyUserInOrganization(
      organizationId,
      req.user.id,
    );

    return this.leadsService.update(organizationId, leadId, dto);
  }

  @Delete(':leadId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(AppPermission.LEADS_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a lead from an organization' })
  @ApiResponse({ status: 204, description: 'Lead deleted successfully' })
  @ApiResponse({ status: 404, description: 'Lead not found' })
  async remove(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('leadId', new ParseUUIDPipe()) leadId: string,
    @Request() req: AuthRequest,
  ): Promise<void> {
    await this.accessVerificationService.verifyUserInOrganization(
      organizationId,
      req.user.id,
    );

    await this.leadsService.remove(organizationId, leadId);
  }
}
