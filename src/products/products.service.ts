import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { QueryBuilderService } from '../common/query/query-builder.service';
import { FindProductsQueryDto } from './dto/find-products-query.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBuilder: QueryBuilderService,
  ) {}

  async create(organizationId: string, dto: CreateProductDto) {
    const { media, instances, ...productData } = dto;

    // We trust the RLS extension, but organization_id is required for creation
    return this.prisma.product.create({
      data: {
        ...productData,
        organization_id: organizationId,
        media: media
          ? {
              create: media.map((m, index) => ({
                ...m,
                is_primary: index === 0, // First media defaults to primary
              })),
            }
          : undefined,
        instances: instances
          ? {
              create: instances,
            }
          : undefined,
      },
      include: {
        media: true,
        instances: true,
      },
    });
  }

  async findAll(organizationId: string, filters: FindProductsQueryDto = {}) {
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit =
      filters.limit && filters.limit > 0 ? Math.min(filters.limit, 100) : 20;
    
    const config = {
      allowedFilterFields: [
        'type',
        'title',
        'base_price',
        'currency',
        'created_at'
      ],
      allowedSortFields: [
        'type',
        'title',
        'base_price',
        'created_at'
      ],
      numberFields: ['base_price'],
    };

    const orderBy = this.queryBuilder.buildOrderBy(filters.sorts, config);
    const dynamicWhere = this.queryBuilder.buildWhere(filters.filters, config);

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

    if (Object.keys(dynamicWhere).length > 0) {
      dynamicConditions.push(dynamicWhere);
    }

    const where: Prisma.ProductWhereInput = {
      ...(dynamicConditions.length > 0 ? { AND: dynamicConditions } : {}),
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
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  async update(organizationId: string, id: string, dto: UpdateProductDto) {
    // Intentionally exclude media and instances from update spread
    // These are managed through dedicated endpoints (addMedia, setPrimaryMedia)
    // to prevent accidental bulk updates to nested relationships
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

