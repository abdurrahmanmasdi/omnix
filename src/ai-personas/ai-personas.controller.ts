import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { OrganizationAIPersona } from '@prisma/client';
import { AiPersonasService } from './ai-personas.service';
import { CreateAiPersonaDto } from './dto/create-ai-persona.dto';
import { UpdateAiPersonaDto } from './dto/update-ai-persona.dto';

@ApiTags('ai-personas')
@ApiBearerAuth()
@Controller('ai-personas')
export class AiPersonasController {
  constructor(private readonly aiPersonasService: AiPersonasService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an AI Persona for an organization' })
  @ApiResponse({ status: 201, description: 'AI Persona created' })
  async create(
    @Body() createAiPersonaDto: CreateAiPersonaDto,
  ): Promise<OrganizationAIPersona> {
    return this.aiPersonasService.create(createAiPersonaDto);
  }

  @Get('org/:organizationId')
  @ApiOperation({ summary: 'Get AI Persona for a specific organization' })
  @ApiResponse({ status: 200, description: 'AI Persona retrieved' })
  @ApiResponse({ status: 404, description: 'Persona not found' })
  async findByOrganization(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
  ): Promise<OrganizationAIPersona | null> {
    return this.aiPersonasService.findByOrganization(organizationId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an AI Persona' })
  @ApiResponse({ status: 200, description: 'AI Persona updated' })
  @ApiResponse({ status: 404, description: 'Persona not found' })
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateAiPersonaDto: UpdateAiPersonaDto,
  ): Promise<OrganizationAIPersona> {
    return this.aiPersonasService.update(id, updateAiPersonaDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an AI Persona' })
  @ApiResponse({ status: 204, description: 'AI Persona deleted' })
  @ApiResponse({ status: 404, description: 'Persona not found' })
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.aiPersonasService.remove(id);
  }
}
