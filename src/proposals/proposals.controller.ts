import { Controller, Get, Post, Body, Patch, Param, Delete, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { ProposalsService, CreateProposalDto, UpdateProposalDto } from './proposals.service';
import { ProposalStatus } from '@prisma/client';

interface TenantRequest extends Request {
  tenantId: string;
}

@ApiTags('proposals')
@Controller('proposals')
export class ProposalsController {
  constructor(private readonly proposalsService: ProposalsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a proposal' })
  create(@Req() req: TenantRequest, @Body() createProposalDto: CreateProposalDto) {
    return this.proposalsService.create(req.tenantId, createProposalDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all proposals' })
  findAll() {
    return this.proposalsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a proposal by id' })
  findOne(@Param('id') id: string) {
    return this.proposalsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a proposal' })
  update(@Param('id') id: string, @Body() updateProposalDto: UpdateProposalDto) {
    return this.proposalsService.update(id, updateProposalDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a proposal' })
  remove(@Param('id') id: string) {
    return this.proposalsService.remove(id);
  }

  @Post(':id/verify')
  @ApiOperation({ summary: 'Verify a proposal' })
  verify(@Param('id') id: string) {
    return this.proposalsService.update(id, { status: ProposalStatus.VERIFIED });
  }
}
