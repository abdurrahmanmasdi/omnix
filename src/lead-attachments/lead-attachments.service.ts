import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeadAttachmentDto } from './dtos/create-lead-attachment.dto';

type LeadAttachmentWithUploader = Prisma.LeadAttachmentGetPayload<{
  include: {
    uploaded_by: {
      select: {
        id: true;
        first_name: true;
        last_name: true;
        email: true;
        created_at: true;
      };
    };
  };
}>;

@Injectable()
export class LeadAttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
  ) {}

  async create(
    organizationId: string,
    leadId: string,
    uploadedById: string,
    dto: CreateLeadAttachmentDto,
  ): Promise<LeadAttachmentWithUploader> {
    await this.assertLeadInOrganization(organizationId, leadId);

    return this.prisma.leadAttachment.create({
      data: {
        lead_id: leadId,
        uploaded_by_id: uploadedById,
        file_name: dto.file_name,
        file_url: dto.file_url,
      },
      include: {
        uploaded_by: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
            created_at: true,
          },
        },
      },
    });
  }

  async findAll(
    organizationId: string,
    leadId: string,
  ): Promise<LeadAttachmentWithUploader[]> {
    await this.assertLeadInOrganization(organizationId, leadId);

    return this.prisma.leadAttachment.findMany({
      where: {
        lead_id: leadId,
      },
      include: {
        uploaded_by: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
            created_at: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });
  }

  async remove(
    organizationId: string,
    leadId: string,
    attachmentId: string,
  ): Promise<void> {
    await this.assertLeadInOrganization(organizationId, leadId);

    const result = await this.prisma.leadAttachment.deleteMany({
      where: {
        id: attachmentId,
        lead_id: leadId,
      },
    });

    if (result.count === 0) {
      throw new NotFoundException(
        this.i18n.t('leads.ERRORS.LEAD_ATTACHMENT_NOT_FOUND'),
      );
    }
  }

  private async assertLeadInOrganization(
    organizationId: string,
    leadId: string,
  ): Promise<void> {
    const lead = await this.prisma.lead.findFirst({
      where: {
        id: leadId,
        organization_id: organizationId,
      },
      select: { id: true },
    });

    if (!lead) {
      throw new NotFoundException(this.i18n.t('leads.ERRORS.NOT_FOUND'));
    }
  }
}
