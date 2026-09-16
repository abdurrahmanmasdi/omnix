import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  QueryBuilderService,
  QueryBuilderConfig,
} from '../common/query/query-builder.service';
import {
  CreateLeadDto,
  FindLeadsQueryDto,
  UpdateLeadDto,
  UpdateLeadStageDto,
} from './dtos/lead.dto';
import { EventsGateway } from '../events/events/events.gateway';
import { Prisma } from '@prisma/client';

const LEAD_RELATIONS_INCLUDE = {
  assignedAgent: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  source: true,
  pipelineStage: true,
  conversation: {
    select: { id: true, status: true, createdAt: true, updatedAt: true },
  },
};

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBuilder: QueryBuilderService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  async create(organizationId: string, dto: CreateLeadDto) {
    await this.validateScopedReferences(organizationId, dto);

    return this.prisma.lead.create({
      data: {
        organizationId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phoneNumber: dto.phoneNumber,
        country: dto.country,
        timezone: dto.timezone,
        primaryLanguage: dto.primaryLanguage,
        preferredLanguage: dto.preferredLanguage,
        nativeName: dto.nativeName,
        email: dto.email,
        socialLinks: dto.socialLinks
          ? (dto.socialLinks as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        gender: dto.gender,
        sourceId: dto.sourceId,
        pipelineStageId: dto.pipelineStageId,
        assignedAgentId: dto.assignedAgentId,
        status: dto.status || 'NEW',
        priority: dto.priority || 'WARM',
        estimatedValue: dto.estimatedValue,
        currency: dto.currency || 'USD',
        expectedServiceDate: dto.expectedServiceDate
          ? new Date(dto.expectedServiceDate)
          : null,
        nextFollowUpAt: dto.nextFollowUpAt
          ? new Date(dto.nextFollowUpAt)
          : null,
      },
      include: LEAD_RELATIONS_INCLUDE,
    });
  }

  async findAll(
    organizationId: string,
    userId: string,
    filters: FindLeadsQueryDto,
  ) {
    const canReadAllLeads = true; // Replace with your RBAC check

    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit =
      filters.limit && filters.limit > 0 ? Math.min(filters.limit, 100) : 20;

    // 🚀 Expanded AST Config to include the new fields
    const config: QueryBuilderConfig = {
      allowedFilterFields: [
        'status',
        'priority',
        'sourceId',
        'assignedAgentId',
        'country',
        'firstName',
        'lastName',
        'email',
        'estimatedValue',
        'createdAt',
        'pipelineStageId',
        'nextFollowUpAt',
        'expectedServiceDate',
        'timezone',
      ],
      allowedSortFields: [
        'createdAt',
        'firstName',
        'estimatedValue',
        'status',
        'priority',
        'assignedAgent.firstName',
        'pipelineStage.orderIndex',
        'nextFollowUpAt',
        'expectedServiceDate',
      ],
      uuidFields: ['sourceId', 'assignedAgentId', 'pipelineStageId'],
      numberFields: ['estimatedValue'],
      dateFields: ['createdAt', 'expectedServiceDate', 'nextFollowUpAt'],
    };

    const orderBy = this.queryBuilder.buildOrderBy(filters.sorts, config);
    const dynamicWhere = this.queryBuilder.buildWhere(filters.filters, config);

    const dynamicConditions: Prisma.LeadWhereInput[] = [
      { organizationId, deletedAt: null },
    ];

    if (!canReadAllLeads) {
      dynamicConditions.push({ assignedAgentId: userId });
    }

    if (filters.status) dynamicConditions.push({ status: filters.status });
    if (filters.priority)
      dynamicConditions.push({ priority: filters.priority });
    if (Object.keys(dynamicWhere).length > 0)
      dynamicConditions.push(dynamicWhere);

    const where: Prisma.LeadWhereInput = { AND: dynamicConditions };

    // Execute queries sequentially: count first, then fetch leads
    const total = await this.prisma.lead.count({ where });

    const data = await this.prisma.lead.findMany({
      where,
      include: LEAD_RELATIONS_INCLUDE,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async findOne(organizationId: string, userId: string, leadId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, organizationId, deletedAt: null },
      include: LEAD_RELATIONS_INCLUDE,
    });

    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  async updateStage(
    organizationId: string,
    userId: string,
    leadId: string,
    dto: UpdateLeadStageDto,
  ) {
    await this.findOne(organizationId, userId, leadId); // Verifies existence and access

    // Validate the pipeline stage belongs to the org
    const stage = await this.prisma.pipelineStage.findFirst({
      where: { id: dto.pipelineStageId, organizationId, deletedAt: null },
    });
    if (!stage) {
      throw new BadRequestException('Invalid Pipeline Stage');
    }

    const updateData: any = { pipelineStageId: dto.pipelineStageId };
    if (dto.status) {
      updateData.status = dto.status;
    }

    const updatedLead = await this.prisma.lead.update({
      where: { id: leadId },
      data: updateData,
      include: LEAD_RELATIONS_INCLUDE,
    });

    // Broadcast the update so UI reacts in real-time
    this.eventsGateway.broadcastLeadUpdate(organizationId, updatedLead);

    return updatedLead;
  }

  async update(
    organizationId: string,
    userId: string,
    leadId: string,
    dto: UpdateLeadDto,
  ) {
    await this.findOne(organizationId, userId, leadId); // Verifies existence and access
    await this.validateScopedReferences(organizationId, dto);

    // Safely parse dates and JSON if they are provided in the update payload
    const updateData: Prisma.LeadUpdateInput = {
      ...dto,
      socialLinks: dto.socialLinks
        ? (dto.socialLinks as Prisma.InputJsonValue)
        : undefined,
      expectedServiceDate: dto.expectedServiceDate
        ? new Date(dto.expectedServiceDate)
        : undefined,
      nextFollowUpAt: dto.nextFollowUpAt
        ? new Date(dto.nextFollowUpAt)
        : undefined,
    };

    // Clean out undefined values to prevent overwriting existing data with null
    const cleanData = updateData as Record<string, unknown>;
    Object.keys(cleanData).forEach(
      (key) => cleanData[key] === undefined && delete cleanData[key],
    );

    return this.prisma.lead.update({
      where: { id: leadId },
      data: updateData,
      include: LEAD_RELATIONS_INCLUDE,
    });
  }

  async remove(organizationId: string, userId: string, leadId: string) {
    await this.findOne(organizationId, userId, leadId);

    await this.prisma.lead.update({
      where: { id: leadId },
      data: { deletedAt: new Date() },
    });

    return { success: true, message: 'Lead successfully deleted' };
  }

  private async validateScopedReferences(
    organizationId: string,
    dto: Partial<CreateLeadDto>,
  ) {
    if (dto.sourceId) {
      const source = await this.prisma.leadSource.findFirst({
        where: {
          id: dto.sourceId,
          organizationId,
          isActive: true,
          deletedAt: null,
        },
      });
      if (!source)
        throw new BadRequestException('Invalid or inactive Lead Source');
    }

    if (dto.assignedAgentId) {
      const agent = await this.prisma.organizationMembership.findFirst({
        where: {
          userId: dto.assignedAgentId,
          organizationId,
          status: 'ACTIVE',
        },
      });
      if (!agent)
        throw new BadRequestException(
          'Assigned user is not an active agent in this organization',
        );
    }

    if (dto.pipelineStageId) {
      const stage = await this.prisma.pipelineStage.findFirst({
        where: { id: dto.pipelineStageId, organizationId },
      });
      if (!stage)
        throw new BadRequestException(
          'Pipeline stage not found in this organization',
        );
    }
  }
}
