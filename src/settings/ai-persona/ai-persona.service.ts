import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpsertAiPersonaDto } from './dto/upsert-ai-persona.dto';

@Injectable()
export class AiPersonaService {
  constructor(private readonly prisma: PrismaService) {}

  async getPersona(organizationId: string) {
    const persona = await this.prisma.aiPersona.findUnique({
      where: { organizationId },
    });

    if (!persona) {
      throw new NotFoundException('AI Persona configuration not found for this organization');
    }

    return persona;
  }

  async upsertPersona(organizationId: string, dto: UpsertAiPersonaDto) {
    return this.prisma.aiPersona.upsert({
      where: { organizationId },
      update: {
        agentName: dto.agentName,
        clinicName: dto.clinicName,
        tone: dto.tone,
        handoffMessage: dto.handoffMessage,
        businessRules: dto.businessRules,
      },
      create: {
        organizationId,
        agentName: dto.agentName,
        clinicName: dto.clinicName,
        tone: dto.tone,
        handoffMessage: dto.handoffMessage,
        businessRules: dto.businessRules,
      },
    });
  }
}
