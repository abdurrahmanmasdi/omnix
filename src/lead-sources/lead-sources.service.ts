import { Injectable, NotFoundException } from '@nestjs/common';
import { LeadSource, Prisma } from '@prisma/client';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeadSourceDto } from './dtos/create-lead-source.dto';
import { UpdateLeadSourceDto } from './dtos/update-lead-source.dto';

@Injectable()
export class LeadSourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
  ) {}

  async create(
    organizationId: string,
    dto: CreateLeadSourceDto,
  ): Promise<LeadSource> {
    return this.prisma.leadSource.create({
      data: {
        organization_id: organizationId,
        name: dto.name,
        ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
      },
    });
  }

  async findAll(
    organizationId: string,
    activeOnly?: boolean,
  ): Promise<LeadSource[]> {
    return this.prisma.leadSource.findMany({
      where: {
        organization_id: organizationId,
        ...(activeOnly ? { is_active: true } : {}),
      },
      orderBy: {
        created_at: 'desc',
      },
    });
  }

  async update(
    organizationId: string,
    sourceId: string,
    dto: UpdateLeadSourceDto,
  ): Promise<LeadSource> {
    const data = this.buildUpdateData(dto);

    if (Object.keys(data).length === 0) {
      const source = await this.prisma.leadSource.findFirst({
        where: {
          id: sourceId,
          organization_id: organizationId,
        },
      });

      if (!source) {
        throw new NotFoundException(this.i18n.t('leads.ERRORS.RESOURCE_NOT_FOUND'));
      }

      return source;
    }

    const result = await this.prisma.leadSource.updateMany({
      where: {
        id: sourceId,
        organization_id: organizationId,
      },
      data,
    });

    if (result.count === 0) {
      throw new NotFoundException(this.i18n.t('leads.ERRORS.RESOURCE_NOT_FOUND'));
    }

    const updated = await this.prisma.leadSource.findFirst({
      where: {
        id: sourceId,
        organization_id: organizationId,
      },
    });

    if (!updated) {
      throw new NotFoundException(this.i18n.t('leads.ERRORS.RESOURCE_NOT_FOUND'));
    }

    return updated;
  }

  async remove(organizationId: string, sourceId: string): Promise<void> {
    const result = await this.prisma.leadSource.deleteMany({
      where: {
        id: sourceId,
        organization_id: organizationId,
      },
    });

    if (result.count === 0) {
      throw new NotFoundException(this.i18n.t('leads.ERRORS.RESOURCE_NOT_FOUND'));
    }
  }

  private buildUpdateData(
    dto: UpdateLeadSourceDto,
  ): Prisma.LeadSourceUncheckedUpdateManyInput {
    const data: Prisma.LeadSourceUncheckedUpdateManyInput = {};

    if (dto.name !== undefined) {
      data.name = dto.name;
    }

    if (dto.is_active !== undefined) {
      data.is_active = dto.is_active;
    }

    return data;
  }
}
