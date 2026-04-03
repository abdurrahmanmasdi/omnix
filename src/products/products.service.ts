import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, ProductType } from '@prisma/client';
import { ProductsQueryBuilder } from './utils/products.query-builder';
import { FindProductsQueryDto } from './dto/find-products-query.dto';
export interface CreateProductDto {
  type: ProductType;
  title: string;
  description?: string;
  base_price: number;
  currency?: string;
  specifications?: Prisma.InputJsonValue;
  available_addons?: Prisma.InputJsonValue;
  media?: { file_url: string; file_name?: string }[];
  instances?: { start_date?: Date; end_date?: Date; max_capacity?: number }[];
}

export interface UpdateProductDto extends Partial<CreateProductDto> {}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBuilder: ProductsQueryBuilder,
  ) {}

  async create(organizationId: string, dto: CreateProductDto) {
    const { media, instances, ...productData } = dto;
    
    // We trust the RLS extension, but organization_id is required for creation
    return this.prisma.product.create({
      data: {
        ...productData,
        organization_id: organizationId,
        media: media ? {
          create: media.map((m, index) => ({
            ...m,
            is_primary: index === 0, // First media defaults to primary
          }))
        } : undefined,
        instances: instances ? {
          create: instances
        } : undefined,
      },
      include: {
        media: true,
        instances: true,
      }
    });
  }

  async findAll(organizationId: string, filters: FindProductsQueryDto = {}) {
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit =
      filters.limit && filters.limit > 0 ? Math.min(filters.limit, 100) : 20;
    const orderBy = this.queryBuilder.buildOrderBy(
      filters.sort_by,
      filters.sort_dir,
    );

    const dynamicConditions: Prisma.ProductWhereInput[] = [
      { organization_id: organizationId },
    ];

    if (filters.type) {
      dynamicConditions.push({ type: filters.type });
    }

    const search = filters.search?.trim();
    if (search) {
      dynamicConditions.push({
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    const parsedRules = this.queryBuilder.parseDynamicFilterRules(
      filters.filters,
    );

    for (const rule of parsedRules) {
      const condition = this.queryBuilder.buildDynamicFilterCondition(rule);
      if (condition) {
        dynamicConditions.push(condition);
      }
    }

    const where: Prisma.ProductWhereInput = {
      AND: dynamicConditions,
    };

    const [total, data] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: {
          media: true,
          instances: true,
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
    const product = await this.prisma.product.findFirst({
      where: { id, organization_id: organizationId },
      include: {
        media: true,
        instances: true,
      }
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  async update(organizationId: string, id: string, dto: UpdateProductDto) {
    const { media, instances, ...updateData } = dto;
    const existing = await this.findOne(organizationId, id); // validates it belongs to org
    return this.prisma.product.update({
      where: { id: existing.id },
      data: updateData,
    });
  }

  async remove(organizationId: string, id: string) {
    const existing = await this.findOne(organizationId, id);
    return this.prisma.product.delete({
      where: { id: existing.id },
    });
  }
}
