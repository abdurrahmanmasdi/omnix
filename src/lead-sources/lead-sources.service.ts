import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeadSourceDto } from './dtos/create-lead-source.dto';
import { UpdateLeadSourceDto } from './dtos/update-lead-source.dto';

@Injectable()
export class LeadSourcesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, dto: CreateLeadSourceDto) {
    return this.prisma.leadSource.create({
      data: {
        organizationId,
        name: dto.name,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async findAll(organizationId: string) {
    return this.prisma.leadSource.findMany({
      where: {
        organizationId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const source = await this.prisma.leadSource.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!source) throw new NotFoundException('Lead source not found');
    return source;
  }

  async update(organizationId: string, id: string, dto: UpdateLeadSourceDto) {
    // Ensure the source actually belongs to this organization before updating
    const source = await this.prisma.leadSource.findFirst({
      where: { id, organizationId, deletedAt: null },
    });

    if (!source) throw new NotFoundException('Lead source not found');

    return this.prisma.leadSource.update({
      where: { id },
      data: dto,
    });
  }

  async remove(organizationId: string, id: string) {
    // Perform a soft delete while ensuring tenant isolation
    const result = await this.prisma.leadSource.updateMany({
      where: { id, organizationId, deletedAt: null },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    if (result.count === 0) {
      throw new NotFoundException('Lead source not found');
    }

    return { success: true, message: 'Lead source removed' };
  }
}
