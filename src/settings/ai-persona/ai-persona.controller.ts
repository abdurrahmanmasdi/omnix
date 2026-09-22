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
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('AI Persona Settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('settings/ai-persona')
export class AiPersonaController {
  constructor(private readonly aiPersonaService: AiPersonaService) {}

  @RequirePermissions('ai_settings:view')
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

  @RequirePermissions('ai_settings:manage')
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
