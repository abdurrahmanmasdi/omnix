import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Request as ExpressRequest } from 'express';
import { SocialLinksService } from './social-links.service';
import { CreateSocialLinkDto } from './dtos/create-social-link.dto';
import { UpdateSocialLinkDto } from './dtos/update-social-link.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AppPermission } from '../constants/permissions.registry';

interface TenantRequest extends ExpressRequest {
  tenantId: string;
}

@ApiTags('social-links')
@Controller('social-links')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class SocialLinksController {
  constructor(private readonly socialLinksService: SocialLinksService) {}

  @Post()
  @RequirePermissions(AppPermission.ORGANIZATION_EDIT_ALL)
  @ApiOperation({ summary: 'Create a social link' })
  @ApiResponse({ status: 201, description: 'Social link created successfully' })
  async create(
    @Request() req: TenantRequest,
    @Body() dto: CreateSocialLinkDto,
  ) {
    return this.socialLinksService.create(req.tenantId, dto);
  }

  @Get()
  @RequirePermissions(AppPermission.ORGANIZATION_READ)
  @ApiOperation({ summary: 'List social links for the organization' })
  @ApiResponse({
    status: 200,
    description: 'Social links retrieved successfully',
  })
  async findAll(@Request() req: TenantRequest) {
    return this.socialLinksService.findAll(req.tenantId);
  }

  @Patch(':id')
  @RequirePermissions(AppPermission.ORGANIZATION_EDIT_ALL)
  @ApiOperation({ summary: 'Update a social link' })
  @ApiResponse({ status: 200, description: 'Social link updated successfully' })
  async update(
    @Param('id') id: string,
    @Request() req: TenantRequest,
    @Body() dto: UpdateSocialLinkDto,
  ) {
    return this.socialLinksService.update(req.tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(AppPermission.ORGANIZATION_EDIT_ALL)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a social link' })
  @ApiResponse({ status: 204, description: 'Social link deleted successfully' })
  async remove(@Param('id') id: string, @Request() req: TenantRequest) {
    return this.socialLinksService.remove(req.tenantId, id);
  }
}
