import { MembershipStatus } from '@prisma/client';
import { describe, expect, it, jest } from '@jest/globals';
import { PermissionsService } from './permissions.service';
import { RequestContextService } from '../../request-context/request-context.service';

describe('PermissionsService', () => {
  const createRedisMock = () => ({
    get: jest.fn(() => Promise.resolve(null as string | null)),
    set: jest.fn(() => Promise.resolve(undefined)),
    sAdd: jest.fn(() => Promise.resolve(1)),
    expire: jest.fn(() => Promise.resolve(true)),
    isConnected: jest.fn().mockReturnValue(false),
  });

  it('executes organizationMembership query inside tenant context even for lazy thenables', async () => {
    const requestContextService = new RequestContextService();
    const redisMock = createRedisMock();

    const prismaMock = {
      organizationMembership: {
        findFirst: jest.fn(),
      },
    };

    prismaMock.organizationMembership.findFirst.mockImplementation(() => {
      const lazyThenable = {
        then: (
          resolve: (value: unknown) => void,
          reject: (reason?: unknown) => void,
        ) => {
          const tenantId = requestContextService.getTenantId();

          if (!tenantId) {
            reject(
              new Error(
                'Kiraci baglami olmadan kiraciya bagli "OrganizationMembership" modeline erisilmeye calisildi.',
              ),
            );
            return;
          }

          resolve({
            role: {
              rolePermissions: [
                {
                  permission: {
                    action: 'team_members:manage',
                  },
                },
              ],
            },
            permissionOverrides: [],
          });
        },
      };

      return lazyThenable as unknown as Promise<unknown>;
    });

    const service = new PermissionsService(
      prismaMock as never,
      redisMock as never,
      requestContextService,
    );

    const permissions = await service.getEffectivePermissions(
      'user-1',
      'org-1',
    );

    expect(prismaMock.organizationMembership.findFirst).toHaveBeenCalledWith({
      where: {
        user_id: 'user-1',
        organization_id: 'org-1',
        status: MembershipStatus.ACTIVE,
      },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: {
                permission: {
                  select: {
                    action: true,
                  },
                },
              },
            },
          },
        },
        permissionOverrides: {
          include: {
            permission: {
              select: {
                action: true,
              },
            },
          },
        },
      },
    });

    expect(permissions).toEqual(['team_members:manage']);
  });
});
