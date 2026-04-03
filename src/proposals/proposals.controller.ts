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
import { Request as ExpressRequest } from 'express';
import { AccessVerificationService } from '../access-control/access-verification.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AppPermission } from '../constants/permissions.registry';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { UpdateProposalDto } from './dto/update-proposal.dto';
import { ProposalsService } from './proposals.service';

interface AuthRequest extends ExpressRequest {
  user: {
    id: string;
  };
}

@ApiTags('proposals')
@ApiBearerAuth()
@Controller('organizations/:organizationId/proposals')
export class ProposalsController {
  constructor(
    private readonly proposalsService: ProposalsService,
    private readonly accessVerificationService: AccessVerificationService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(AppPermission.PROPOSALS_CREATE)
  @ApiOperation({ summary: 'Create a proposal in an organization' })
  @ApiResponse({ status: 201, description: 'Proposal created successfully' })
  async create(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Request() req: AuthRequest,
    @Body() createProposalDto: CreateProposalDto,
  ) {
    await this.accessVerificationService.verifyUserInOrganization(
      organizationId,
      req.user.id,
    );
    return this.proposalsService.create(organizationId, createProposalDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(AppPermission.PROPOSALS_READ)
  @ApiOperation({ summary: 'List proposals in organization' })
  @ApiResponse({ status: 200, description: 'Proposals fetched successfully' })
  async findAll(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Request() req: AuthRequest,
  ) {
    await this.accessVerificationService.verifyUserInOrganization(
      organizationId,
      req.user.id,
    );
    return this.proposalsService.findAll(organizationId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(AppPermission.PROPOSALS_READ)
  @ApiOperation({ summary: 'Get a single proposal from an organization' })
  @ApiResponse({ status: 200, description: 'Proposal fetched successfully' })
  @ApiResponse({ status: 404, description: 'Proposal not found' })
  async findOne(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Request() req: AuthRequest,
  ) {
    await this.accessVerificationService.verifyUserInOrganization(
      organizationId,
      req.user.id,
    );
    return this.proposalsService.findOne(organizationId, id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(AppPermission.PROPOSALS_EDIT)
  @ApiOperation({ summary: 'Update a proposal in an organization' })
  @ApiResponse({ status: 200, description: 'Proposal updated successfully' })
  @ApiResponse({ status: 404, description: 'Proposal not found' })
  async update(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Request() req: AuthRequest,
    @Body() updateProposalDto: UpdateProposalDto,
  ) {
    await this.accessVerificationService.verifyUserInOrganization(
      organizationId,
      req.user.id,
    );
    return this.proposalsService.update(organizationId, id, updateProposalDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(AppPermission.PROPOSALS_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a proposal from an organization' })
  @ApiResponse({ status: 204, description: 'Proposal deleted successfully' })
  @ApiResponse({ status: 404, description: 'Proposal not found' })
  async remove(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Request() req: AuthRequest,
  ): Promise<void> {
    await this.accessVerificationService.verifyUserInOrganization(
      organizationId,
      req.user.id,
    );
    await this.proposalsService.remove(organizationId, id);
  }

  @Post(':id/verify')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(AppPermission.PROPOSALS_EDIT)
  @ApiOperation({ summary: 'Verify a proposal in an organization' })
  @ApiResponse({ status: 200, description: 'Proposal verified successfully' })
  async verify(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Request() req: AuthRequest,
  ) {
    await this.accessVerificationService.verifyUserInOrganization(
      organizationId,
      req.user.id,
    );
    return this.proposalsService.verify(organizationId, id);
  }
}
