import { MembershipStatus, Prisma } from '@prisma/client';
import { DEFAULT_ROLE_MATRIX } from '../constants/default-role-matrix';
import { OrganizationProvisioningService } from './organization-provisioning.service';

type PermissionRecord = {
  id: string;
  action: string;
};

type TxMock = {
  permission: {
    findMany: jest.Mock<Promise<PermissionRecord[]>, []>;
  };
  role: {
    create: jest.Mock<Promise<{ id: string }>, [Record<string, unknown>]>;
  };
  rolePermission: {
    createMany: jest.Mock<Promise<unknown>, [Record<string, unknown>]>;
  };
  organizationMembership: {
    create: jest.Mock<Promise<unknown>, [Record<string, unknown>]>;
  };
};

const makePermissions = (): PermissionRecord[] => {
  const allActions = Array.from(
    new Set(DEFAULT_ROLE_MATRIX.flatMap((role) => role.permissionActions)),
  );

  return allActions.map((action, index) => ({
    id: `perm-${index + 1}`,
    action,
  }));
};

describe('OrganizationProvisioningService', () => {
  let service: OrganizationProvisioningService;
  let tx: TxMock;

  beforeEach(() => {
    service = new OrganizationProvisioningService();
    tx = {
      permission: {
        findMany: jest.fn<Promise<PermissionRecord[]>, []>(),
      },
      role: {
        create: jest.fn<Promise<{ id: string }>, [Record<string, unknown>]>(),
      },
      rolePermission: {
        createMany: jest.fn<Promise<unknown>, [Record<string, unknown>]>(),
      },
      organizationMembership: {
        create: jest.fn<Promise<unknown>, [Record<string, unknown>]>(),
      },
    };
  });

  it('creates owner, manager, and agent roles with exact matrix-based permission mappings', async () => {
    const permissions = makePermissions();
    tx.permission.findMany.mockResolvedValueOnce(permissions);
    tx.role.create
      .mockResolvedValueOnce({ id: 'role-owner' })
      .mockResolvedValueOnce({ id: 'role-manager' })
      .mockResolvedValueOnce({ id: 'role-agent' });
    tx.rolePermission.createMany.mockResolvedValue(undefined);
    tx.organizationMembership.create.mockResolvedValue(undefined);

    await service.provisionDefaultTenantRBAC(
      tx as unknown as Prisma.TransactionClient,
      'org-1',
      'user-1',
    );

    expect(tx.role.create).toHaveBeenCalledTimes(3);

    const ownerRoleCall = tx.role.create.mock.calls[0]?.[0] as {
      data: {
        name: string;
        slug: string;
        organization_id: string;
        rolePermissions: {
          create: Array<{ permission_id: string }>;
        };
      };
    };

    expect(ownerRoleCall.data.name).toBe('Kurucu');
    expect(ownerRoleCall.data.slug).toBe('owner');
    expect(ownerRoleCall.data.organization_id).toBe('org-1');
    expect(ownerRoleCall.data.rolePermissions.create).toEqual(
      permissions.map((permission) => ({
        permission_id: permission.id,
      })),
    );

    const managerTemplate = DEFAULT_ROLE_MATRIX.find(
      (role) => role.name === 'Yönetici',
    );
    const agentTemplate = DEFAULT_ROLE_MATRIX.find(
      (role) => role.name === 'Temsilci',
    );

    expect(managerTemplate).toBeDefined();
    expect(agentTemplate).toBeDefined();

    if (!managerTemplate || !agentTemplate) {
      throw new Error('Expected manager and agent templates to exist.');
    }

    const resolvePermissionIds = (actions: string[]): string[] =>
      actions
        .map(
          (action) =>
            permissions.find((permission) => permission.action === action)?.id,
        )
        .filter((id): id is string => Boolean(id));

    const managerPermissionIds = resolvePermissionIds(
      managerTemplate.permissionActions,
    );
    const agentPermissionIds = resolvePermissionIds(
      agentTemplate.permissionActions,
    );

    expect(tx.rolePermission.createMany).toHaveBeenNthCalledWith(1, {
      data: managerPermissionIds.map((permissionId) => ({
        role_id: 'role-manager',
        permission_id: permissionId,
      })),
      skipDuplicates: true,
    });

    expect(tx.rolePermission.createMany).toHaveBeenNthCalledWith(2, {
      data: agentPermissionIds.map((permissionId) => ({
        role_id: 'role-agent',
        permission_id: permissionId,
      })),
      skipDuplicates: true,
    });

    expect(tx.organizationMembership.create).toHaveBeenCalledWith({
      data: {
        user_id: 'user-1',
        organization_id: 'org-1',
        role_id: 'role-owner',
        status: MembershipStatus.ACTIVE,
      },
    });
  });

  it('rethrows errors raised mid-loop so the parent transaction can roll back', async () => {
    const permissions = makePermissions();
    const dbFailure = new Error('mid-loop failure');

    tx.permission.findMany.mockResolvedValueOnce(permissions);
    tx.role.create
      .mockResolvedValueOnce({ id: 'role-owner' })
      .mockResolvedValueOnce({ id: 'role-manager' });
    tx.rolePermission.createMany.mockRejectedValueOnce(dbFailure);

    await expect(
      service.provisionDefaultTenantRBAC(
        tx as unknown as Prisma.TransactionClient,
        'org-1',
        'user-1',
      ),
    ).rejects.toBe(dbFailure);

    expect(tx.role.create).toHaveBeenCalledTimes(2);
    expect(tx.rolePermission.createMany).toHaveBeenCalledTimes(1);
    expect(tx.organizationMembership.create).not.toHaveBeenCalled();
  });
});
