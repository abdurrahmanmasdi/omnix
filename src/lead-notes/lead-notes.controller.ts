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
import { CreateLeadNoteDto } from './dtos/create-lead-note.dto';
import { LeadNotesService } from './lead-notes.service';

interface AuthRequest extends ExpressRequest {
  user: {
    id: string;
  };
}

@ApiTags('lead-notes')
@ApiBearerAuth()
@Controller('organizations/:organizationId/leads/:leadId/notes')
export class LeadNotesController {
  constructor(
    private readonly leadNotesService: LeadNotesService,
    private readonly accessVerificationService: AccessVerificationService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(AppPermission.LEADS_READ)
  @ApiOperation({ summary: 'List lead notes' })
  @ApiResponse({ status: 200, description: 'Lead notes fetched' })
  async findAll(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('leadId', new ParseUUIDPipe()) leadId: string,
    @Request() req: AuthRequest,
  ) {
    await this.accessVerificationService.verifyUserInOrganization(
      organizationId,
      req.user.id,
    );

    return this.leadNotesService.findAll(organizationId, leadId);
  }

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(AppPermission.LEADS_CREATE)
  @ApiOperation({ summary: 'Create lead note' })
  @ApiResponse({ status: 201, description: 'Lead note created' })
  async create(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('leadId', new ParseUUIDPipe()) leadId: string,
    @Request() req: AuthRequest,
    @Body() dto: CreateLeadNoteDto,
  ) {
    await this.accessVerificationService.verifyUserInOrganization(
      organizationId,
      req.user.id,
    );

    return this.leadNotesService.create(
      organizationId,
      leadId,
      req.user.id,
      dto,
    );
  }

  @Delete(':noteId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(AppPermission.LEADS_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete lead note' })
  @ApiResponse({ status: 204, description: 'Lead note deleted' })
  async remove(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('leadId', new ParseUUIDPipe()) leadId: string,
    @Param('noteId', new ParseUUIDPipe()) noteId: string,
    @Request() req: AuthRequest,
  ): Promise<void> {
    await this.accessVerificationService.verifyUserInOrganization(
      organizationId,
      req.user.id,
    );

    await this.leadNotesService.remove(organizationId, leadId, noteId);
  }
}
