import { Injectable, NotFoundException, Logger, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { I18nService } from 'nestjs-i18n';
import { CreateSocialLinkDto } from './dtos/create-social-link.dto';
import { UpdateSocialLinkDto } from './dtos/update-social-link.dto';
import { OrganizationSocialLink } from '@prisma/client';

@Injectable()
export class SocialLinksService {
  private readonly logger = new Logger(SocialLinksService.name);

  constructor(
    private prisma: PrismaService,
    private i18n: I18nService,
  ) {}

  async create(organizationId: string, createDto: CreateSocialLinkDto): Promise<OrganizationSocialLink> {
    try {
      return await this.prisma.organizationSocialLink.create({
        data: {
          ...createDto,
          organization_id: organizationId,
        },
      });
    } catch (error) {
      this.logger.error(`Error creating social link: ${error}`);
      throw new InternalServerErrorException('Failed to create social link');
    }
  }

  async findAll(organizationId: string): Promise<OrganizationSocialLink[]> {
    try {
      return await this.prisma.organizationSocialLink.findMany({
        where: { organization_id: organizationId },
        orderBy: { created_at: 'desc' },
      });
    } catch (error) {
      this.logger.error(`Error fetching social links: ${error}`);
      throw new InternalServerErrorException('Failed to fetch social links');
    }
  }

  async findOne(organizationId: string, id: string): Promise<OrganizationSocialLink> {
    try {
      const link = await this.prisma.organizationSocialLink.findFirst({
        where: { id, organization_id: organizationId },
      });

      if (!link) {
        throw new NotFoundException(`Social link not found`);
      }

      return link;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Error fetching social link: ${error}`);
      throw new InternalServerErrorException('Failed to fetch social link');
    }
  }

  async update(organizationId: string, id: string, updateDto: UpdateSocialLinkDto): Promise<OrganizationSocialLink> {
    try {
      await this.findOne(organizationId, id); // verify exists

      return await this.prisma.organizationSocialLink.update({
        where: { id },
        data: updateDto,
      });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Error updating social link: ${error}`);
      throw new InternalServerErrorException('Failed to update social link');
    }
  }

  async remove(organizationId: string, id: string): Promise<void> {
    try {
      await this.findOne(organizationId, id); // verify exists
      await this.prisma.organizationSocialLink.delete({
        where: { id },
      });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Error deleting social link: ${error}`);
      throw new InternalServerErrorException('Failed to delete social link');
    }
  }
}
