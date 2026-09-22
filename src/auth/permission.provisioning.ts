import { Prisma } from '@prisma/client';
import { PERMISSIONS_CATALOG } from './permissions.catalog';

/**
 * Provisions the canonical permission catalog and grants all of them to the specified role.
 * Safe to call idempotently inside a transaction.
 */
export async function provisionRolePermissions(
  tx: Omit<
    Prisma.TransactionClient,
    '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
  >,
  roleId: string,
) {
  // 1. Create any missing permissions in the database
  await tx.permission.createMany({
    data: PERMISSIONS_CATALOG.map((p) => ({
      action: p.action,
      description: p.description,
    })),
    skipDuplicates: true,
  });

  // 2. Fetch their IDs (createMany does not return IDs)
  const actions = PERMISSIONS_CATALOG.map((p) => p.action);
  const permissions = await tx.permission.findMany({
    where: { action: { in: actions } },
    select: { id: true, action: true },
  });

  // Verify we actually found all of them
  if (permissions.length !== actions.length) {
    throw new Error('Failed to retrieve all provisioned permissions from the database');
  }

  // 3. Grant them all to the role
  await tx.rolePermission.createMany({
    data: permissions.map((p) => ({
      roleId,
      permissionId: p.id,
    })),
    skipDuplicates: true,
  });
}
