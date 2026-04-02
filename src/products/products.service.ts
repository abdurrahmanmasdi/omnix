import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, ProductType } from '@prisma/client';

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
  constructor(private readonly prisma: PrismaService) {}

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

  async findAll() {
    return this.prisma.product.findMany({
      include: {
        media: true,
        instances: true,
      }
    });
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
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

  async update(id: string, dto: UpdateProductDto) {
    const { media, instances, ...updateData } = dto;
    return this.prisma.product.update({
      where: { id },
      data: updateData,
    });
  }

  async remove(id: string) {
    return this.prisma.product.delete({
      where: { id },
    });
  }
}
