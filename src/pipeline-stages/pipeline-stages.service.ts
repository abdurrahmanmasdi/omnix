import { Injectable, NotFoundException } from '@nestjs/common';
import { PipelineStage, Prisma } from '@prisma/client';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePipelineStageDto } from './dtos/create-pipeline-stage.dto';
import { UpdatePipelineStageDto } from './dtos/update-pipeline-stage.dto';

@Injectable()
export class PipelineStagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
  ) {}

  async create(
    organizationId: string,
    dto: CreatePipelineStageDto,
  ): Promise<PipelineStage> {
    return this.prisma.pipelineStage.create({
      data: {
        organization_id: organizationId,
        name: dto.name,
        order_index: dto.order_index,
      },
    });
  }

  async findAll(organizationId: string): Promise<PipelineStage[]> {
    return this.prisma.pipelineStage.findMany({
      where: {
        organization_id: organizationId,
      },
      orderBy: {
        order_index: 'asc',
      },
    });
  }

  async update(
    organizationId: string,
    stageId: string,
    dto: UpdatePipelineStageDto,
  ): Promise<PipelineStage> {
    const data = this.buildUpdateData(dto);

    if (Object.keys(data).length === 0) {
      const stage = await this.prisma.pipelineStage.findFirst({
        where: {
          id: stageId,
          organization_id: organizationId,
        },
      });

      if (!stage) {
        throw new NotFoundException(this.i18n.t('errors.NOT_FOUND'));
      }

      return stage;
    }

    const result = await this.prisma.pipelineStage.updateMany({
      where: {
        id: stageId,
        organization_id: organizationId,
      },
      data,
    });

    if (result.count === 0) {
      throw new NotFoundException(this.i18n.t('errors.NOT_FOUND'));
    }

    const updated = await this.prisma.pipelineStage.findFirst({
      where: {
        id: stageId,
        organization_id: organizationId,
      },
    });

    if (!updated) {
      throw new NotFoundException(this.i18n.t('errors.NOT_FOUND'));
    }

    return updated;
  }

  async remove(organizationId: string, stageId: string): Promise<void> {
    const result = await this.prisma.pipelineStage.deleteMany({
      where: {
        id: stageId,
        organization_id: organizationId,
      },
    });

    if (result.count === 0) {
      throw new NotFoundException(this.i18n.t('errors.NOT_FOUND'));
    }
  }

  private buildUpdateData(
    dto: UpdatePipelineStageDto,
  ): Prisma.PipelineStageUncheckedUpdateManyInput {
    const data: Prisma.PipelineStageUncheckedUpdateManyInput = {};

    if (dto.name !== undefined) {
      data.name = dto.name;
    }

    if (dto.order_index !== undefined) {
      data.order_index = dto.order_index;
    }

    return data;
  }
}
