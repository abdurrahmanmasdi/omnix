import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import { Request as ExpressRequest } from 'express';
import { AccessVerificationService } from '../access-control/access-verification.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AppPermission } from '../constants/permissions.registry';
import { CreateLeadAttachmentDto } from './dtos/create-lead-attachment.dto';
import { LeadAttachmentsService } from './lead-attachments.service';

interface AuthRequest extends ExpressRequest {
  user: {
    id: string;
  };
}

@ApiTags('lead-attachments')
@ApiBearerAuth()
@Controller('organizations/:organizationId/leads/:leadId/attachments')
export class LeadAttachmentsController {
  constructor(
    private readonly leadAttachmentsService: LeadAttachmentsService,
    private readonly accessVerificationService: AccessVerificationService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(AppPermission.LEADS_READ)
  @ApiOperation({ summary: 'List lead attachments' })
  @ApiResponse({ status: 200, description: 'Lead attachments fetched' })
  async findAll(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('leadId', new ParseUUIDPipe()) leadId: string,
    @Request() req: AuthRequest,
  ) {
    await this.accessVerificationService.verifyUserInOrganization(
      organizationId,
      req.user.id,
    );

    return this.leadAttachmentsService.findAll(organizationId, leadId);
  }

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(AppPermission.LEADS_CREATE)
  @ApiOperation({ summary: 'Create lead attachment' })
  @ApiResponse({ status: 201, description: 'Lead attachment created' })
  async create(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('leadId', new ParseUUIDPipe()) leadId: string,
    @Request() req: AuthRequest,
    @Body() dto: CreateLeadAttachmentDto,
  ) {
    await this.accessVerificationService.verifyUserInOrganization(
      organizationId,
      req.user.id,
    );

    return this.leadAttachmentsService.create(
      organizationId,
      leadId,
      req.user.id,
      dto,
    );
  }

  @Delete(':attachmentId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(AppPermission.LEADS_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete lead attachment' })
  @ApiResponse({ status: 204, description: 'Lead attachment deleted' })
  async remove(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('leadId', new ParseUUIDPipe()) leadId: string,
    @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
    @Request() req: AuthRequest,
  ): Promise<void> {
    await this.accessVerificationService.verifyUserInOrganization(
      organizationId,
      req.user.id,
    );

    await this.leadAttachmentsService.remove(
      organizationId,
      leadId,
      attachmentId,
    );
  }
}
