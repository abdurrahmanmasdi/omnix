import { Prisma } from '@prisma/client';
import { PERMISSIONS_CATALOG, ROLE_PERMISSIONS } from './permissions.catalog';

/**
 * Provisions the canonical permission catalog and default roles (Super Admin, Manager, Agent)
 * for an organization. Safe to call idempotently inside a transaction.
 * Returns the created roles mapped by name.
 */
export async function provisionOrganizationRolesAndPermissions(
  tx: Omit<
    Prisma.TransactionClient,
    '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
  >,
  organizationId: string,
) {
  // 1. Create any missing permissions in the database
  await tx.permission.createMany({
    data: PERMISSIONS_CATALOG.map((p) => ({
      action: p.action,
      description: p.description,
    })),
    skipDuplicates: true,
  });

  const actions = PERMISSIONS_CATALOG.map((p) => p.action);
  const permissions = await tx.permission.findMany({
    where: { action: { in: actions } },
    select: { id: true, action: true },
  });

  const permissionIdMap = new Map(permissions.map((p) => [p.action, p.id]));

  // 2. Create the standard roles
  const roles = await Promise.all(
    Object.keys(ROLE_PERMISSIONS).map(async (roleName) => {
      // Find or create role
      let role = await tx.role.findFirst({
        where: { organizationId, name: roleName },
      });
      if (!role) {
        role = await tx.role.create({
          data: {
            name: roleName,
            is_system: true,
            organizationId,
          },
        });
      }
      return role;
    }),
  );

  const roleMap = new Map(roles.map((r) => [r.name, r]));

  // 3. Grant permissions to each role
  const rolePermissionsData = [];
  for (const [roleName, actions] of Object.entries(ROLE_PERMISSIONS)) {
    const role = roleMap.get(roleName);
    if (!role) continue;
    for (const action of actions) {
      const permissionId = permissionIdMap.get(action);
      if (permissionId) {
        rolePermissionsData.push({
          roleId: role.id,
          permissionId,
        });
      }
    }
  }

  await tx.rolePermission.createMany({
    data: rolePermissionsData,
    skipDuplicates: true,
  });

  return roleMap;
}
