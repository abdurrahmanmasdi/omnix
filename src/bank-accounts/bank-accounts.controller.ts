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
import { BankAccountsService } from './bank-accounts.service';
import { CreateBankAccountDto } from './dtos/create-bank-account.dto';
import { UpdateBankAccountDto } from './dtos/update-bank-account.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AppPermission } from '../constants/permissions.registry';

interface TenantRequest extends ExpressRequest {
  tenantId: string;
}

@ApiTags('bank-accounts')
@Controller('bank-accounts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class BankAccountsController {
  constructor(private readonly bankAccountsService: BankAccountsService) {}

  @Post()
  @RequirePermissions(AppPermission.ORGANIZATION_EDIT_ALL)
  @ApiOperation({ summary: 'Create a bank account' })
  @ApiResponse({
    status: 201,
    description: 'Bank account created successfully',
  })
  async create(
    @Request() req: TenantRequest,
    @Body() dto: CreateBankAccountDto,
  ) {
    return this.bankAccountsService.create(req.tenantId, dto);
  }

  @Get()
  @RequirePermissions(AppPermission.ORGANIZATION_READ)
  @ApiOperation({ summary: 'List bank accounts for the organization' })
  @ApiResponse({
    status: 200,
    description: 'Bank accounts retrieved successfully',
  })
  async findAll(@Request() req: TenantRequest) {
    return this.bankAccountsService.findAll(req.tenantId);
  }

  @Patch(':id')
  @RequirePermissions(AppPermission.ORGANIZATION_EDIT_ALL)
  @ApiOperation({ summary: 'Update a bank account' })
  @ApiResponse({
    status: 200,
    description: 'Bank account updated successfully',
  })
  async update(
    @Param('id') id: string,
    @Request() req: TenantRequest,
    @Body() dto: UpdateBankAccountDto,
  ) {
    return this.bankAccountsService.update(req.tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(AppPermission.ORGANIZATION_EDIT_ALL)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a bank account' })
  @ApiResponse({
    status: 204,
    description: 'Bank account deleted successfully',
  })
  async remove(@Param('id') id: string, @Request() req: TenantRequest) {
    return this.bankAccountsService.remove(req.tenantId, id);
  }
}
