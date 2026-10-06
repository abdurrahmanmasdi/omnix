import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export const MEMBERSHIP_GRANTS_INCLUDE = {
  role: {
    include: { rolePermissions: { include: { permission: true } } },
  },
  permissionOverrides: { include: { permission: true } },
} as const;

type MembershipWithGrants = Prisma.OrganizationMembershipGetPayload<{
  include: typeof MEMBERSHIP_GRANTS_INCLUDE;
}>;

export function membershipHasPermission(
  membership: MembershipWithGrants,
  action: string,
): boolean {
  const override = membership.permissionOverrides.find(
    (item) => item.permission.action === action,
  );
  return override
    ? override.is_granted
    : membership.role.rolePermissions.some(
        (item) => item.permission.action === action,
      );
}

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
      include: MEMBERSHIP_GRANTS_INCLUDE,
    });
    if (!membership) return false;
    return membershipHasPermission(membership, action);
  }
}
