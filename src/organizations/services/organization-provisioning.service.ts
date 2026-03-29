import { Injectable } from '@nestjs/common';
import { MembershipStatus, Prisma } from '@prisma/client';
import { DEFAULT_ROLE_MATRIX } from '../constants/default-role-matrix';

@Injectable()
export class OrganizationProvisioningService {
  async provisionDefaultTenantRBAC(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
  ): Promise<void> {
    // Step 5: Fetch all global permissions.
    const allPermissions = await tx.permission.findMany();
    const permissionMap = new Map(allPermissions.map((p) => [p.action, p.id]));

    // Step 6: Create Owner role with all permissions.
    const ownerTranslations = { en: 'Owner', ar: 'المالك' };
    const ownerRole = await tx.role.create({
      data: {
        name: 'Kurucu',
        name_translations: ownerTranslations as Prisma.InputJsonValue,
        is_system: true,
        slug: 'owner',
        organization_id: organizationId,
        rolePermissions: {
          create: allPermissions.map((perm) => ({
            permission_id: perm.id,
          })),
        },
      },
      include: { rolePermissions: true },
    });

    // Step 7: Create Manager and Agent roles based on default matrix.
    const roleTranslations: Record<string, { en: string; ar: string }> = {
      Yönetici: { en: 'Manager', ar: 'مدير' },
      Temsilci: { en: 'Agent', ar: 'وكيل' },
    };

    const systemRoleSlugs: Record<string, string> = {
      Yönetici: 'manager',
      Temsilci: 'agent',
    };

    for (const roleTemplate of DEFAULT_ROLE_MATRIX.filter(
      (role) => role.name !== 'Kurucu',
    )) {
      const translations = roleTranslations[roleTemplate.name];

      const role = await tx.role.create({
        data: {
          name: roleTemplate.name,
          ...(translations && {
            name_translations: translations as Prisma.InputJsonValue,
          }),
          is_system: true,
          slug: systemRoleSlugs[roleTemplate.name],
          organization_id: organizationId,
        },
      });

      const rolePermissions = roleTemplate.permissionActions
        .map((action) => permissionMap.get(action))
        .filter((id): id is string => Boolean(id));

      if (rolePermissions.length > 0) {
        await tx.rolePermission.createMany({
          data: rolePermissions.map((permissionId) => ({
            role_id: role.id,
            permission_id: permissionId,
          })),
          skipDuplicates: true,
        });
      }
    }

    // Step 8: Assign creator to organization as owner.
    await tx.organizationMembership.create({
      data: {
        user_id: userId,
        organization_id: organizationId,
        role_id: ownerRole.id,
        status: MembershipStatus.ACTIVE,
      },
    });
  }
}
