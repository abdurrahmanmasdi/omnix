import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ProductMediaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sets the primary media for a product ensuring only one is_primary is true at a time.
   */
  async setPrimaryMedia(productId: string, mediaId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Ensure media exists and belongs to this product
      const media = await tx.productMedia.findFirst({
        where: { id: mediaId, product_id: productId },
      });

      if (!media) {
        throw new NotFoundException(
          'Product media not found or does not belong to this product',
        );
      }

      // 1. Reset all media for this product
      await tx.productMedia.updateMany({
        where: { product_id: productId },
        data: { is_primary: false },
      });

      // 2. Set the requested one to primary
      await tx.productMedia.update({
        where: { id: mediaId },
        data: { is_primary: true },
      });
    });
  }

  async createMedia(
    productId: string,
    fileUrl: string,
    fileName?: string,
  ): Promise<any> {
    const existingCount = await this.prisma.productMedia.count({
      where: { product_id: productId },
    });

    return this.prisma.productMedia.create({
      data: {
        product_id: productId,
        file_url: fileUrl,
        file_name: fileName,
        is_primary: existingCount === 0, // Make primary if it's the first one
      },
    });
  }

  async deleteMedia(mediaId: string): Promise<void> {
    await this.prisma.productMedia.delete({
      where: { id: mediaId },
    });
  }
}
