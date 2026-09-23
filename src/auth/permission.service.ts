import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Resolves role grants, with membership overrides taking precedence. */
@Injectable()
export class PermissionService {
  constructor(private readonly prisma: PrismaService) {}

  async has(
    userId: string,
    organizationId: string,
    action: string,
  ): Promise<boolean> {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { userId, organizationId, status: 'ACTIVE', deletedAt: null },
      include: {
        role: {
          include: { rolePermissions: { include: { permission: true } } },
        },
        permissionOverrides: { include: { permission: true } },
      },
    });
    if (!membership) return false;
    const override = membership.permissionOverrides.find(
      (item) => item.permission.action === action,
    );
    return override
      ? override.is_granted
      : membership.role.rolePermissions.some(
          (item) => item.permission.action === action,
        );
  }
}
