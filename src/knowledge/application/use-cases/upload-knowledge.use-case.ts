import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  KNOWLEDGE_ENGINE_PORT,
  KnowledgeEnginePort,
} from '../ports/knowledge-engine.port';

@Injectable()
export class UploadKnowledgeUseCase {
  constructor(
    @Inject(KNOWLEDGE_ENGINE_PORT)
    private readonly knowledgeEngine: KnowledgeEnginePort,
    private readonly prisma: PrismaService,
  ) {}

  async execute(
    file: Express.Multer.File,
    organizationId: string,
    userId: string,
  ): Promise<any> {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        organization_id: organizationId,
        user_id: userId,
      },
      select: { id: true },
    });

    if (!membership) {
      throw new ForbiddenException('You do not belong to this organization');
    }

    return this.knowledgeEngine.uploadDocument(file, organizationId);
  }
}
