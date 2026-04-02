import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductType, ProposalStatus } from '@prisma/client';
import { I18nService, I18nContext } from 'nestjs-i18n';

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
  ) {}

  /**
   * Check if a product or an instance has enough available capacity
   * for the given dates and quantity.
   */
  async checkAvailability(
    productId: string,
    qty: number,
    startDate?: Date,
    endDate?: Date,
    instanceId?: string,
  ): Promise<boolean> {
    const lang = I18nContext.current()?.lang;

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new BadRequestException(
        this.i18n.t('products.errors.not_found', { lang })
      );
    }

    if (product.type === ProductType.SCHEDULED_EVENT && instanceId) {
      // Rule A: Scheduled Events
      const instance = await this.prisma.productInstance.findUnique({
        where: { id: instanceId },
      });

      if (!instance) {
        throw new BadRequestException(
          this.i18n.t('products.errors.instance_not_found', { lang })
        );
      }

      if (instance.booked_quantity + qty > instance.max_capacity) {
        throw new BadRequestException(
          this.i18n.t('products.errors.capacity_exceeded', { lang })
        );
      }

      return true;
    }

    if (product.type === ProductType.RESOURCE_RENTAL && startDate && endDate) {
      // Rule B: Resource Rentals
      const conflictingRental = await this.prisma.proposalLineItem.findFirst({
        where: {
          product_id: productId,
          start_date: { lt: endDate },
          end_date: { gt: startDate },
          proposal: {
            status: { in: [ProposalStatus.ACCEPTED, ProposalStatus.VERIFIED] },
          },
        },
      });

      if (conflictingRental) {
        throw new ConflictException(
          this.i18n.t('products.errors.not_available_dates', { lang })
        );
      }

      return true;
    }

    if (product.type === ProductType.REAL_ESTATE_ASSET) {
      // Rule C: Real Estate Asset
      if (startDate && endDate) {
        const conflictingRental = await this.prisma.proposalLineItem.findFirst({
          where: {
            product_id: productId,
            start_date: { lt: endDate },
            end_date: { gt: startDate },
            proposal: {
              status: { in: [ProposalStatus.ACCEPTED, ProposalStatus.VERIFIED] },
            },
          },
        });

        if (conflictingRental) {
          throw new ConflictException(
            this.i18n.t('products.errors.not_available_dates', { lang })
          );
        }
      } else {
        const soldAsset = await this.prisma.proposalLineItem.findFirst({
          where: {
            product_id: productId,
            proposal: {
              status: { in: [ProposalStatus.ACCEPTED, ProposalStatus.VERIFIED] },
            },
          },
        });

        if (soldAsset) {
          throw new ConflictException(
            this.i18n.t('products.errors.already_sold', { lang })
          );
        }
      }
      return true;
    }

    // Default to true for DYNAMIC_SERVICE unless extended later
    return true;
  }
}
