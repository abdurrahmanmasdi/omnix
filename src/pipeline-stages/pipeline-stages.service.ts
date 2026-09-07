import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePipelineStageDto,
  UpdatePipelineStageDto,
  BulkReorderStagesDto,
} from './dtos/pipeline-stage.dto';

@Injectable()
export class PipelineStagesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, dto: CreatePipelineStageDto) {
    let newOrderIndex = dto.orderIndex;

    // If no order index is provided, append it to the end of the board
    if (newOrderIndex === undefined) {
      const lastStage = await this.prisma.pipelineStage.findFirst({
        where: { organizationId, deletedAt: null },
        orderBy: { orderIndex: 'desc' },
      });
      newOrderIndex = lastStage ? lastStage.orderIndex + 1 : 0;
    }

    return this.prisma.pipelineStage.create({
      data: {
        organizationId,
        name: dto.name,
        mappedStatus: dto.mappedStatus,
        orderIndex: newOrderIndex,
      },
    });
  }

  async findAll(organizationId: string) {
    return this.prisma.pipelineStage.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { orderIndex: 'asc' }, // Always return in Kanban order
    });
  }

  async findOne(organizationId: string, id: string) {
    const stage = await this.prisma.pipelineStage.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!stage) throw new NotFoundException('Pipeline stage not found');
    return stage;
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdatePipelineStageDto,
  ) {
    await this.findOne(organizationId, id); // Validates existence and tenant access

    return this.prisma.pipelineStage.update({
      where: { id },
      data: dto,
    });
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);

    // Soft delete
    await this.prisma.pipelineStage.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { success: true, message: 'Pipeline stage deleted successfully' };
  }

  // 🚀 Special Endpoint for Kanban Drag & Drop
  async reorder(organizationId: string, dto: BulkReorderStagesDto) {
    // We run this inside a transaction so if one fails, they all fail (keeps board state clean)
    const transaction = dto.stages.map((stage) =>
      this.prisma.pipelineStage.updateMany({
        where: { id: stage.id, organizationId, deletedAt: null },
        data: { orderIndex: stage.orderIndex },
      }),
    );

    await this.prisma.$transaction(transaction);

    return { success: true, message: 'Pipeline stages reordered' };
  }
}
