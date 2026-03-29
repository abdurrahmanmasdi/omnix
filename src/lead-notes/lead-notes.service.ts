import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeadNoteDto } from './dtos/create-lead-note.dto';

type LeadNoteWithAuthor = Prisma.LeadNoteGetPayload<{
  include: {
    author: {
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
export class LeadNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
  ) {}

  async create(
    organizationId: string,
    leadId: string,
    authorId: string,
    dto: CreateLeadNoteDto,
  ): Promise<LeadNoteWithAuthor> {
    await this.assertLeadInOrganization(organizationId, leadId);

    return this.prisma.leadNote.create({
      data: {
        lead_id: leadId,
        author_id: authorId,
        content: dto.content,
      },
      include: {
        author: {
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
  ): Promise<LeadNoteWithAuthor[]> {
    await this.assertLeadInOrganization(organizationId, leadId);

    return this.prisma.leadNote.findMany({
      where: {
        lead_id: leadId,
      },
      include: {
        author: {
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
    noteId: string,
  ): Promise<void> {
    await this.assertLeadInOrganization(organizationId, leadId);

    const result = await this.prisma.leadNote.deleteMany({
      where: {
        id: noteId,
        lead_id: leadId,
      },
    });

    if (result.count === 0) {
      throw new NotFoundException(this.i18n.t('errors.LEAD_NOTES.NOT_FOUND'));
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
      throw new NotFoundException(this.i18n.t('errors.LEADS.NOT_FOUND'));
    }
  }
}
