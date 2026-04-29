import { Injectable, NotFoundException } from '@nestjs/common';
import { OrganizationAIPersona } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequestContextService } from '../request-context/request-context.service';
import { CreateAiPersonaDto } from './dto/create-ai-persona.dto';
import { UpdateAiPersonaDto } from './dto/update-ai-persona.dto';

@Injectable()
export class AiPersonasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContextService: RequestContextService,
  ) {}

  /**
   * Create a new AI Persona for an organization
   */
  async create(dto: CreateAiPersonaDto): Promise<OrganizationAIPersona> {
    const {
      organizationId,
      systemPrompt,
      name,
      voiceId,
      canNegotiate,
      autoAttendNewLeads,
      outboundMessagesSpeed,
      sleepStartHour,
      sleepEndHour,
    } = dto;

    // Check if organization already has a persona
    const existing = await this.prisma.organizationAIPersona.findUnique({
      where: { organization_id: organizationId },
    });

    if (existing) {
      throw new Error(
        `Organization ${organizationId} already has an AI persona`,
      );
    }

    return this.prisma.organizationAIPersona.create({
      data: {
        organization_id: organizationId,
        system_prompt: systemPrompt,
        name: name || 'Assistant',
        voice_id: voiceId,
        can_negotiate: canNegotiate ?? false,
        auto_attend_new_leads: autoAttendNewLeads ?? true,
        outbound_messages_speed: outboundMessagesSpeed ?? 50,
        sleep_start_hour: sleepStartHour,
        sleep_end_hour: sleepEndHour,
      },
    });
  }

  /**
   * Find the AI Persona for a specific organization
   */
  async findByOrganization(
    organizationId: string,
  ): Promise<OrganizationAIPersona | null> {
    return this.prisma.organizationAIPersona.findUnique({
      where: { organization_id: organizationId },
    });
  }

  /**
   * Update an AI Persona
   */
  async update(
    id: string,
    dto: UpdateAiPersonaDto,
  ): Promise<OrganizationAIPersona> {
    return this.requestContextService.runWithBypass(async () => {
      // Verify persona exists
      const persona = await this.prisma.organizationAIPersona.findUnique({
        where: { id },
      });

      if (!persona) {
        throw new NotFoundException(`AI Persona with ID ${id} not found`);
      }

      // Build update data, only including provided fields
      const updateData: Record<string, any> = {};

      if (dto.systemPrompt !== undefined) {
        updateData.system_prompt = dto.systemPrompt;
      }
      if (dto.name !== undefined) {
        updateData.name = dto.name;
      }
      if (dto.voiceId !== undefined) {
        updateData.voice_id = dto.voiceId;
      }
      if (dto.canNegotiate !== undefined) {
        updateData.can_negotiate = dto.canNegotiate;
      }
      if (dto.autoAttendNewLeads !== undefined) {
        updateData.auto_attend_new_leads = dto.autoAttendNewLeads;
      }
      if (dto.outboundMessagesSpeed !== undefined) {
        updateData.outbound_messages_speed = dto.outboundMessagesSpeed;
      }
      if (dto.sleepStartHour !== undefined) {
        updateData.sleep_start_hour = dto.sleepStartHour;
      }
      if (dto.sleepEndHour !== undefined) {
        updateData.sleep_end_hour = dto.sleepEndHour;
      }

      return this.prisma.organizationAIPersona.update({
        where: { id },
        data: updateData,
      });
    });
  }

  /**
   * Delete an AI Persona
   */
  async remove(id: string): Promise<void> {
    return this.requestContextService.runWithBypass(async () => {
      const persona = await this.prisma.organizationAIPersona.findUnique({
        where: { id },
      });

      if (!persona) {
        throw new NotFoundException(`AI Persona with ID ${id} not found`);
      }

      await this.prisma.organizationAIPersona.delete({
        where: { id },
      });
    });
  }
}
