import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ProductMediaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sets the primary media for a product ensuring only one is_primary is true at a time.
   * Uses a Prisma transaction to ensure atomicity.
   * Returns the updated media record with is_primary: true.
   */
  async setPrimaryMedia(productId: string, mediaId: string): Promise<any> {
    return await this.prisma.$transaction(
      async (tx) => {
        // Verify media exists and belongs to this product
        const media = await tx.productMedia.findFirst({
          where: { id: mediaId, product_id: productId },
        });

        if (!media) {
          throw new NotFoundException(
            'Product media not found or does not belong to this product',
          );
        }

        // 1. Reset all media for this product to is_primary: false
        await tx.productMedia.updateMany({
          where: { product_id: productId },
          data: { is_primary: false },
        });

        // 2. Set the requested media to is_primary: true
        const updatedMedia = await tx.productMedia.update({
          where: { id: mediaId },
          data: { is_primary: true },
        });

        return updatedMedia;
      },
      {
        isolationLevel: 'Serializable', // Ensure strict isolation to prevent race conditions
      },
    );
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
      },
    });
  }

  async deleteMedia(mediaId: string): Promise<void> {
    await this.prisma.productMedia.delete({
      where: { id: mediaId },
    });
  }
}
