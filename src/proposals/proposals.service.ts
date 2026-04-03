import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';
import { Prisma, ProposalStatus } from '@prisma/client';
import { randomBytes } from 'crypto';

export interface CreateProposalDto {
  lead_id: string;
  created_by_id: string;
  bank_account_id?: string;
  total_amount: number;
  currency?: string;
  client_notes?: string;
  line_items: CreateProposalLineItemDto[];
}

export interface CreateProposalLineItemDto {
  product_id?: string;
  instance_id?: string;
  start_date?: Date;
  end_date?: Date;
  custom_name: string;
  unit_price: number;
  quantity?: number;
  selected_addons?: Prisma.InputJsonValue;
}

export interface UpdateProposalDto {
  status?: ProposalStatus;
  bank_account_id?: string;
  total_amount?: number;
  client_notes?: string;
  client_accepted_kvkk?: boolean;
}

@Injectable()
export class ProposalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productsService: ProductsService,
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

  async findAll(organizationId: string) {
    return this.prisma.proposal.findMany({
      where: {
        organization_id: organizationId,
      },
      include: {
        line_items: true,
      },
    });
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
