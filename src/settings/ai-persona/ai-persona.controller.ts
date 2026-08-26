import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AiPersonaService } from './ai-persona.service';
import { UpsertAiPersonaDto } from './dto/upsert-ai-persona.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('AI Persona Settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('settings/ai-persona')
export class AiPersonaController {
  constructor(private readonly aiPersonaService: AiPersonaService) {}

  @Get()
  @ApiOperation({ summary: 'Get AI Persona configuration for the organization' })
  @ApiResponse({ status: 200, description: 'The AI Persona configuration.' })
  @ApiResponse({ status: 404, description: 'AI Persona configuration not found.' })
  async getPersona(@CurrentUser() user: AuthenticatedUser) {
    if (!user.organizationId) {
      throw new UnauthorizedException('User is not assigned to an organization');
    }
    return this.aiPersonaService.getPersona(user.organizationId);
  }

  @Post()
  @ApiOperation({ summary: 'Create or update the AI Persona configuration' })
  @ApiResponse({ status: 200, description: 'The updated AI Persona configuration.' })
  @ApiResponse({ status: 201, description: 'The newly created AI Persona configuration.' })
  async upsertPersona(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertAiPersonaDto,
  ) {
    if (!user.organizationId) {
      throw new UnauthorizedException('User is not assigned to an organization');
    }
    return this.aiPersonaService.upsertPersona(user.organizationId, dto);
  }
}
