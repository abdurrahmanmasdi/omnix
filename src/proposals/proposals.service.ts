import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import { Prisma, ProposalStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { UpdateProposalDto } from './dto/update-proposal.dto';
import { QueryBuilderService } from '../common/query/query-builder.service';
import { FindProposalsQueryDto } from './dto/find-proposals-query.dto';

@Injectable()
export class ProposalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productsService: ProductsService,
    private readonly queryBuilder: QueryBuilderService,
  ) {}

  async create(organizationId: string, dto: CreateProposalDto) {
    const { line_items, ...proposalData } = dto;

    for (const item of line_items) {
      if (item.product_id) {
        const product = await this.productsService.findOne(
          organizationId,
          item.product_id,
        );

        if (
          product?.type === 'RESOURCE_RENTAL' &&
          (!item.start_date || !item.end_date)
        ) {
          throw new BadRequestException(
            `Product ${product.title} is a RESOURCE_RENTAL and requires both start_date and end_date.`,
          );
        }
      }
    }

    const public_link_hash = randomBytes(16).toString('hex');

    return this.prisma.proposal.create({
      data: {
        ...proposalData,
        organization_id: organizationId,
        public_link_hash,
        line_items: {
          create: line_items,
        },
      },
      include: {
        line_items: true,
      },
    });
  }

  async findAll(organizationId: string, filters: FindProposalsQueryDto = {}) {
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit =
      filters.limit && filters.limit > 0 ? Math.min(filters.limit, 100) : 20;

    const config = {
      allowedFilterFields: [
        'status',
        'created_at',
        'subtotal',
        'total',
        'client_id',
      ],
      allowedSortFields: ['status', 'created_at', 'subtotal', 'total'],
      uuidFields: ['client_id'],
      numberFields: ['subtotal', 'total'],
    };

    const orderBy = this.queryBuilder.buildOrderBy(filters.sorts, config);
    const dynamicWhere = this.queryBuilder.buildWhere(filters.filters, config);

    const dynamicConditions: Prisma.ProposalWhereInput[] = [
      { organization_id: organizationId },
    ];

    if (filters.status) {
      dynamicConditions.push({ status: filters.status });
    }

    if (Object.keys(dynamicWhere).length > 0) {
      dynamicConditions.push(dynamicWhere);
    }

    const search = filters.search?.trim();
    if (search) {
      dynamicConditions.push({
        OR: [
          { status: { in: search.toUpperCase() as any } }, // This is basic for string matching if status matches roughly
        ],
      });
    }

    const where: Prisma.ProposalWhereInput = {
      ...(dynamicConditions.length > 0 ? { AND: dynamicConditions } : {}),
    };

    const [total, data] = await Promise.all([
      this.prisma.proposal.count({ where }),
      this.prisma.proposal.findMany({
        where,
        include: {
          line_items: true,
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

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

  async findOne(organizationId: string, id: string) {
    const proposal = await this.prisma.proposal.findFirst({
      where: {
        id,
        organization_id: organizationId,
      },
      include: {
        line_items: {
          include: {
            product: true,
            instance: true,
          },
        },
      },
    });

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    return proposal;
  }

  async update(organizationId: string, id: string, dto: UpdateProposalDto) {
    // Verify proposal exists in this organization first
    const proposal = await this.prisma.proposal.findFirst({
      where: {
        id,
        organization_id: organizationId,
      },
      select: { id: true },
    });

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    return this.prisma.proposal.update({
      where: { id },
      data: dto,
      include: {
        line_items: true,
      },
    });
  }

  async remove(organizationId: string, id: string) {
    // Verify proposal exists in this organization first
    const proposal = await this.prisma.proposal.findFirst({
      where: {
        id,
        organization_id: organizationId,
      },
      select: { id: true },
    });

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    return this.prisma.proposal.delete({
      where: { id },
    });
  }

  async verify(organizationId: string, id: string) {
    return this.update(organizationId, id, { status: ProposalStatus.VERIFIED });
  }
}
