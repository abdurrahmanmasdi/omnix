import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Writes an immutable, tenant-explicit record for actions that need an
 * operational or compliance trail.  Background workers deliberately use a
 * system tenant context, so organizationId is never inferred here.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: {
    organizationId: string;
    action: string;
    targetId?: string;
    actor?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        organizationId: input.organizationId,
        action: input.action,
        targetId: input.targetId,
        actor: input.actor ?? 'system',
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
