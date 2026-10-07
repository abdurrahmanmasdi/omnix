import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ClinicFactsDto,
  ClinicFactRevisionDto,
  ClinicFactSheetDto,
  SaveClinicFactsDto,
} from './dto/clinic-facts.dto';

@Injectable()
export class ClinicFactsService {
  constructor(private readonly prisma: PrismaService) {}
  private revision(
    row: {
      version: number;
      facts: Prisma.JsonValue;
      approvedAt: Date | null;
      approvedBy: string | null;
    } | null,
  ): ClinicFactRevisionDto | null {
    return row
      ? {
          version: row.version,
          facts: row.facts as unknown as ClinicFactsDto,
          approvedAt: row.approvedAt,
          approvedBy: row.approvedBy,
        }
      : null;
  }
  async read(
    organizationId: string,
    actor: string,
  ): Promise<ClinicFactSheetDto> {
    return this.prisma.$transaction(async (tx) => {
      const latest = await tx.clinicFactSheet.findFirst({
        where: { organizationId },
        orderBy: { version: 'desc' },
      });
      const approved = await tx.clinicFactSheet.findFirst({
        where: { organizationId, approvedAt: { not: null } },
        orderBy: { version: 'desc' },
      });
      await tx.auditLog.create({
        data: { organizationId, actor, action: 'clinic_facts.read' },
      });
      return {
        latest: this.revision(latest),
        approved: this.revision(approved),
      };
    });
  }
  async save(
    organizationId: string,
    actor: string,
    dto: SaveClinicFactsDto,
  ): Promise<ClinicFactRevisionDto> {
    if (
      !dto.facts ||
      dto.facts.treatments.some((t) => t.priceMin > t.priceMax) ||
      dto.facts.offers.some(
        (o) => Date.parse(o.validFrom) > Date.parse(o.validTo),
      )
    )
      throw new BadRequestException({ code: 'CLINIC_FACTS_INVALID_RANGE' });
    return this.prisma.$transaction(async (tx) => {
      // Lock the clinic row to serialize revision allocation and approval.
      await tx.organization.update({
        where: { id: organizationId },
        data: { updatedAt: new Date() },
      });
      const latest = await tx.clinicFactSheet.findFirst({
        where: { organizationId },
        orderBy: { version: 'desc' },
      });
      if ((latest?.version ?? 0) !== dto.expectedVersion)
        throw new ConflictException({ code: 'CLINIC_FACTS_VERSION_CONFLICT' });
      const row = await tx.clinicFactSheet.create({
        data: {
          organizationId,
          version: dto.expectedVersion + 1,
          facts: JSON.parse(JSON.stringify(dto.facts)) as Prisma.InputJsonValue,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actor,
          action: 'clinic_facts.draft_saved',
          targetId: row.id,
          metadata: { version: row.version },
        },
      });
      return this.revision(row)!;
    });
  }
  async approve(
    organizationId: string,
    actor: string,
    version: number,
  ): Promise<ClinicFactRevisionDto> {
    return this.prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: organizationId },
        data: { updatedAt: new Date() },
      });
      const latest = await tx.clinicFactSheet.findFirst({
        where: { organizationId },
        orderBy: { version: 'desc' },
      });
      if (!latest)
        throw new NotFoundException({ code: 'CLINIC_FACTS_NOT_FOUND' });
      if (latest.version !== version)
        throw new ConflictException({ code: 'CLINIC_FACTS_VERSION_CONFLICT' });
      if (latest.approvedAt) return this.revision(latest)!;
      const row = await tx.clinicFactSheet.update({
        where: { id: latest.id, organizationId },
        data: { approvedAt: new Date(), approvedBy: actor },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actor,
          action: 'clinic_facts.approved',
          targetId: row.id,
          metadata: { version },
        },
      });
      return this.revision(row)!;
    });
  }
}
