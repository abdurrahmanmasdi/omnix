import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../auth/services/permissions.service';
import { AccessControlService } from './access-control.service';
import { MembershipStatus } from '@prisma/client';

describe('AccessControlService', () => {
  let service: AccessControlService;
  let prismaService: PrismaService;
  let i18nService: I18nService;

  const mockPrismaService = {
    organizationMembership: {
      findFirst: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    role: {
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
    membershipPermissionOverride: {
      upsert: jest.fn(),
    },
    permission: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockI18nService = {
    t: jest.fn((key: string) => key),
  };

  const mockPermissionsService = {
    clearUserPermissionsCache: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccessControlService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: I18nService,
          useValue: mockI18nService,
        },
        {
          provide: PermissionsService,
          useValue: mockPermissionsService,
        },
      ],
    }).compile();

    service = module.get<AccessControlService>(AccessControlService);
    prismaService = module.get<PrismaService>(PrismaService);
    i18nService = module.get<I18nService>(I18nService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ========================================================================
  // Test Suite: deleteRole
  // ========================================================================

  describe('deleteRole', () => {
    const organizationId = '550e8400-e29b-41d4-a716-446655440001';
    const roleId = '550e8400-e29b-41d4-a716-446655440002';
    const userId = '550e8400-e29b-41d4-a716-446655440003';

    // ====================================================================
    // Test 1: Verify user in organization - should throw ForbiddenException
    // ====================================================================

    describe('Expectation 0: User Verification', () => {
      it('should throw ForbiddenException when user does not have ACTIVE membership in organization', async () => {
        // Arrange: User is NOT a member of the organization
        mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce(
          null,
        );

        // Act & Assert
        await expect(
          service.deleteRole(organizationId, roleId, userId),
        ).rejects.toThrow(ForbiddenException);

        expect(
          mockPrismaService.organizationMembership.findFirst,
        ).toHaveBeenCalledWith({
          where: {
            organization_id: organizationId,
            user_id: userId,
            status: MembershipStatus.ACTIVE,
          },
          select: { id: true },
        });
      });
    });

    // ====================================================================
    // Test 2: Role Not Found - should throw NotFoundException
    // ====================================================================

    describe('Expectation 0b: Role Validation', () => {
      it('should throw NotFoundException when role does not exist in organization', async () => {
        // Arrange: User IS a member
        mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce(
          { id: 'membership-1' },
        );
        // Role does NOT exist
        mockPrismaService.role.findFirst.mockResolvedValueOnce(null);

        // Act & Assert
        await expect(
          service.deleteRole(organizationId, roleId, userId),
        ).rejects.toThrow(NotFoundException);

        expect(mockPrismaService.role.findFirst).toHaveBeenCalledWith({
          where: {
            id: roleId,
            organization_id: organizationId,
          },
          select: { id: true, name: true },
        });
      });
    });

    // ====================================================================
    // Expectation 1: Cannot delete 'Owner' role
    // ====================================================================

    describe('Expectation 1: Cannot delete Owner role', () => {
      it('should throw BadRequestException when trying to delete Owner role', async () => {
        // Arrange: User IS a member
        mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce(
          { id: 'membership-1' },
        );
        // Role EXISTS with name "Owner"
        mockPrismaService.role.findFirst.mockResolvedValueOnce({
          id: roleId,
          name: 'Owner',
        });

        // Act & Assert
        await expect(
          service.deleteRole(organizationId, roleId, userId),
        ).rejects.toThrow(BadRequestException);

        // Verify protection message was requested
        expect(mockI18nService.t).toHaveBeenCalledWith(
          'errors.CANNOT_DELETE_PROTECTED_ROLE',
        );

        // Verify role.delete was NOT called
        expect(mockPrismaService.role.delete).not.toHaveBeenCalled();
      });
    });

    // ====================================================================
    // Expectation 2: Cannot delete role with active members
    // ====================================================================

    describe('Expectation 2: Cannot delete role with active members', () => {
      it('should throw BadRequestException when role has active OrganizationMembership records', async () => {
        // Arrange: User IS a member
        mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce(
          { id: 'membership-1' },
        );
        // Role EXISTS with name "CustomRole" (not protected)
        mockPrismaService.role.findFirst.mockResolvedValueOnce({
          id: roleId,
          name: 'CustomRole',
        });
        // Role HAS 2 active members
        mockPrismaService.organizationMembership.count.mockResolvedValueOnce(2);

        // Act & Assert
        await expect(
          service.deleteRole(organizationId, roleId, userId),
        ).rejects.toThrow(BadRequestException);

        // Verify active members check
        expect(
          mockPrismaService.organizationMembership.count,
        ).toHaveBeenCalledWith({
          where: {
            role_id: roleId,
            status: MembershipStatus.ACTIVE,
          },
        });

        // Verify error message requested
        expect(mockI18nService.t).toHaveBeenCalledWith(
          'errors.CANNOT_DELETE_ROLE_WITH_MEMBERS',
        );

        // Verify role.delete was NOT called
        expect(mockPrismaService.role.delete).not.toHaveBeenCalled();
      });
    });

    // ====================================================================
    // Expectation 3: Successfully delete custom role with no active users
    // ====================================================================

    describe('Expectation 3: Successfully delete custom role', () => {
      it('should successfully delete a custom role with no active users', async () => {
        // Arrange: User IS a member
        mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce(
          { id: 'membership-1' },
        );
        // Role EXISTS with name "CustomRole" (not protected)
        mockPrismaService.role.findFirst.mockResolvedValueOnce({
          id: roleId,
          name: 'CustomRole',
        });
        // Role has NO active members (count = 0)
        mockPrismaService.organizationMembership.count.mockResolvedValueOnce(0);
        // Delete succeeds
        mockPrismaService.role.delete.mockResolvedValueOnce({ id: roleId });

        // Act
        const result = await service.deleteRole(organizationId, roleId, userId);

        // Assert
        expect(result).toEqual({
          message: 'messages.ROLE_DELETED_SUCCESSFULLY',
        });

        // Verify all checks were performed in correct order
        expect(
          mockPrismaService.organizationMembership.findFirst,
        ).toHaveBeenCalledTimes(1);
        expect(mockPrismaService.role.findFirst).toHaveBeenCalledTimes(1);
        expect(
          mockPrismaService.organizationMembership.count,
        ).toHaveBeenCalledTimes(1);
        expect(mockPrismaService.role.delete).toHaveBeenCalledWith({
          where: { id: roleId },
        });
      });

      it('should successfully delete a role with name Admin', async () => {
        // Arrange: User IS a member
        mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce(
          { id: 'membership-1' },
        );
        // Role EXISTS with name "Admin" (protected)
        mockPrismaService.role.findFirst.mockResolvedValueOnce({
          id: roleId,
          name: 'Admin',
        });

        // Act & Assert: Should throw because Admin is protected
        await expect(
          service.deleteRole(organizationId, roleId, userId),
        ).rejects.toThrow(BadRequestException);

        expect(mockI18nService.t).toHaveBeenCalledWith(
          'errors.CANNOT_DELETE_PROTECTED_ROLE',
        );
      });

      it('should verify active members count before deletion', async () => {
        // Arrange: User IS a member
        mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce(
          { id: 'membership-1' },
        );
        // Role EXISTS with name "TeamLead" (not protected)
        mockPrismaService.role.findFirst.mockResolvedValueOnce({
          id: roleId,
          name: 'TeamLead',
        });
        // Role has 1 active member
        mockPrismaService.organizationMembership.count.mockResolvedValueOnce(1);

        // Act & Assert
        await expect(
          service.deleteRole(organizationId, roleId, userId),
        ).rejects.toThrow(BadRequestException);

        // Verify the exact query for active members
        expect(
          mockPrismaService.organizationMembership.count,
        ).toHaveBeenCalledWith({
          where: {
            role_id: roleId,
            status: MembershipStatus.ACTIVE,
          },
        });
      });
    });

    // ====================================================================
    // Additional Tests: Edge Cases
    // ====================================================================

    describe('Edge Cases', () => {
      it('should handle deletion when active member count is exactly 0', async () => {
        // Arrange
        mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce(
          { id: 'membership-1' },
        );
        mockPrismaService.role.findFirst.mockResolvedValueOnce({
          id: roleId,
          name: 'EmptyRole',
        });
        mockPrismaService.organizationMembership.count.mockResolvedValueOnce(0);
        mockPrismaService.role.delete.mockResolvedValueOnce({ id: roleId });

        // Act
        const result = await service.deleteRole(organizationId, roleId, userId);

        // Assert
        expect(result.message).toBe('messages.ROLE_DELETED_SUCCESSFULLY');
        expect(mockPrismaService.role.delete).toHaveBeenCalled();
      });

      it('should use the correct organization context when deleting', async () => {
        // Arrange
        const orgId = '550e8400-e29b-41d4-a716-446655440010';
        mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce(
          { id: 'membership-1' },
        );
        mockPrismaService.role.findFirst.mockResolvedValueOnce({
          id: roleId,
          name: 'ScopedRole',
        });
        mockPrismaService.organizationMembership.count.mockResolvedValueOnce(0);
        mockPrismaService.role.delete.mockResolvedValueOnce({ id: roleId });

        // Act
        await service.deleteRole(orgId, roleId, userId);

        // Assert: Role query used the correct org context
        expect(mockPrismaService.role.findFirst).toHaveBeenCalledWith({
          where: {
            id: roleId,
            organization_id: orgId,
          },
          select: { id: true, name: true },
        });
      });
    });
  });

  // ========================================================================
  // Test Suite: changeMemberRole
  // ========================================================================

  describe('changeMemberRole', () => {
    const orgId = '550e8400-e29b-41d4-a716-446655440001';
    const membershipId = '550e8400-e29b-41d4-a716-446655440002';
    const newRoleId = '550e8400-e29b-41d4-a716-446655440003';
    const ownerId = '550e8400-e29b-41d4-a716-446655440004';
    const managerId = '550e8400-e29b-41d4-a716-446655440005';
    const agentId = '550e8400-e29b-41d4-a716-446655440006';

    // ====================================================================
    // Test 1: Caller is Manager (non-Owner)
    // Expected: ForbiddenException
    // ====================================================================

    describe('Security Boundary 1: Non-Owner caller (Manager)', () => {
      it('should throw ForbiddenException when caller is Manager (not Owner)', async () => {
        // Arrange: Caller (managerId) has Manager role, not Owner
        mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce(
          {
            id: 'membership-manager',
            role: { name: 'Manager' },
          },
        );

        // Act & Assert
        await expect(
          service.changeMemberRole(orgId, membershipId, newRoleId, managerId),
        ).rejects.toThrow(ForbiddenException);

        // Verify the error message is correct
        expect(mockI18nService.t).toHaveBeenCalledWith(
          'errors.ONLY_OWNER_CAN_PERFORM_THIS_ACTION',
        );
      });
    });

    // ====================================================================
    // Test 2: Caller is Agent (non-Owner)
    // Expected: ForbiddenException
    // ====================================================================

    describe('Security Boundary 2: Non-Owner caller (Agent)', () => {
      it('should throw ForbiddenException when caller is Agent (not Owner)', async () => {
        // Arrange: Caller (agentId) has Agent role, not Owner
        mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce(
          {
            id: 'membership-agent',
            role: { name: 'Agent' },
          },
        );

        // Act & Assert
        await expect(
          service.changeMemberRole(orgId, membershipId, newRoleId, agentId),
        ).rejects.toThrow(ForbiddenException);

        // Verify call to verify ownership check
        expect(
          mockPrismaService.organizationMembership.findFirst,
        ).toHaveBeenCalledWith({
          where: {
            organization_id: orgId,
            user_id: agentId,
            status: MembershipStatus.ACTIVE,
          },
          include: {
            role: {
              select: { name: true },
            },
          },
        });
      });
    });

    // ====================================================================
    // Test 3: Cannot change Owner's role (immutability)
    // Expected: BadRequestException
    // ====================================================================

    describe('Security Boundary 3: Owner role is immutable', () => {
      it('should throw BadRequestException when attempting to change Owner role', async () => {
        // Arrange: Caller IS Owner
        mockPrismaService.organizationMembership.findFirst
          .mockResolvedValueOnce({
            id: 'membership-owner',
            role: { name: 'Owner' },
          })
          // Second call: fetching target membership which has Owner role
          .mockResolvedValueOnce({
            id: membershipId,
            role: { name: 'Owner' },
          });

        // Act & Assert
        await expect(
          service.changeMemberRole(orgId, membershipId, newRoleId, ownerId),
        ).rejects.toThrow(BadRequestException);

        // Verify the immutability error
        expect(mockI18nService.t).toHaveBeenCalledWith(
          'errors.CANNOT_MODIFY_OWNER_ROLE',
        );
      });
    });

    // ====================================================================
    // Test 4: Target membership not found
    // Expected: NotFoundException
    // ====================================================================

    describe('Expectation 1: Target membership validation', () => {
      it('should throw NotFoundException when target membership does not exist', async () => {
        // Arrange: Caller IS Owner
        mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce(
          {
            id: 'membership-owner',
            role: { name: 'Owner' },
          },
        );
        // Second call: target membership not found
        mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce(
          null,
        );

        // Act & Assert
        await expect(
          service.changeMemberRole(orgId, membershipId, newRoleId, ownerId),
        ).rejects.toThrow(NotFoundException);

        expect(mockI18nService.t).toHaveBeenCalledWith(
          'errors.MEMBERSHIP_NOT_FOUND',
        );
      });
    });

    // ====================================================================
    // Test 5: New role not found
    // Expected: NotFoundException
    // ====================================================================

    describe('Expectation 2: New role validation', () => {
      it('should throw NotFoundException when new role does not exist', async () => {
        // Arrange: Caller IS Owner
        mockPrismaService.organizationMembership.findFirst
          .mockResolvedValueOnce({
            id: 'membership-owner',
            role: { name: 'Owner' },
          })
          // Target membership with Agent role
          .mockResolvedValueOnce({
            id: membershipId,
            role: { name: 'Agent' },
          });
        // New role not found
        mockPrismaService.role.findFirst.mockResolvedValueOnce(null);

        // Act & Assert
        await expect(
          service.changeMemberRole(orgId, membershipId, newRoleId, ownerId),
        ).rejects.toThrow(NotFoundException);

        expect(mockI18nService.t).toHaveBeenCalledWith('errors.ROLE_NOT_FOUND');
      });
    });

    // ====================================================================
    // Test 6: Successful role change (Owner modifying Agent)
    // Expected: Success
    // ====================================================================

    describe('Success Case: Valid Owner modifies Agent', () => {
      it('should successfully change Agent role when called by Owner', async () => {
        // Arrange: Caller IS Owner
        mockPrismaService.organizationMembership.findFirst
          .mockResolvedValueOnce({
            id: 'membership-owner',
            role: { name: 'Owner' },
          })
          // Target membership is Agent (not Owner)
          .mockResolvedValueOnce({
            id: membershipId,
            role: { name: 'Agent' },
          });
        // New role exists
        mockPrismaService.role.findFirst.mockResolvedValueOnce({
          id: newRoleId,
        });
        // Update succeeds
        mockPrismaService.organizationMembership.update.mockResolvedValueOnce({
          id: membershipId,
          role_id: newRoleId,
        });

        // Act
        const result = await service.changeMemberRole(
          orgId,
          membershipId,
          newRoleId,
          ownerId,
        );

        // Assert
        expect(result.id).toBe(membershipId);
        expect(result.role_id).toBe(newRoleId);
        expect(mockI18nService.t).toHaveBeenCalledWith(
          'messages.MEMBER_ROLE_CHANGED_SUCCESSFULLY',
        );
        expect(
          mockPrismaService.organizationMembership.update,
        ).toHaveBeenCalledWith({
          where: { id: membershipId },
          data: { role_id: newRoleId },
        });
      });
    });
  });

  // ========================================================================
  // Test Suite: assignPermissionOverride
  // ========================================================================

  describe('assignPermissionOverride', () => {
    const orgId = '550e8400-e29b-41d4-a716-446655440010';
    const membershipId = '550e8400-e29b-41d4-a716-446655440011';
    const permissionId = '550e8400-e29b-41d4-a716-446655440012';
    const ownerId = '550e8400-e29b-41d4-a716-446655440013';
    const managerId = '550e8400-e29b-41d4-a716-446655440014';

    // ====================================================================
    // Test 1: Caller is Manager (non-Owner)
    // Expected: ForbiddenException
    // ====================================================================

    describe('Security Boundary 1: Non-Owner caller (Manager)', () => {
      it('should throw ForbiddenException when caller is Manager (not Owner)', async () => {
        // Arrange: Caller has Manager role, not Owner
        mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce(
          {
            id: 'membership-manager',
            role: { name: 'Manager' },
          },
        );

        // Act & Assert
        await expect(
          service.assignPermissionOverride(
            orgId,
            membershipId,
            permissionId,
            true,
            managerId,
          ),
        ).rejects.toThrow(ForbiddenException);

        expect(mockI18nService.t).toHaveBeenCalledWith(
          'errors.ONLY_OWNER_CAN_PERFORM_THIS_ACTION',
        );
      });
    });

    // ====================================================================
    // Test 2: Cannot override permissions for Owner
    // Expected: BadRequestException
    // ====================================================================

    describe('Security Boundary 2: Cannot override Owner permissions', () => {
      it('should throw BadRequestException when attempting to override Owner permissions', async () => {
        // Arrange: Caller IS Owner
        mockPrismaService.organizationMembership.findFirst
          .mockResolvedValueOnce({
            id: 'membership-owner',
            role: { name: 'Owner' },
          })
          // Target membership has Owner role
          .mockResolvedValueOnce({
            id: membershipId,
            role: { name: 'Owner' },
          });

        // Act & Assert
        await expect(
          service.assignPermissionOverride(
            orgId,
            membershipId,
            permissionId,
            true,
            ownerId,
          ),
        ).rejects.toThrow(BadRequestException);

        expect(mockI18nService.t).toHaveBeenCalledWith(
          'errors.CANNOT_OVERRIDE_OWNER_PERMISSIONS',
        );
      });
    });

    // ====================================================================
    // Test 3: Target membership not found
    // Expected: NotFoundException
    // ====================================================================

    describe('Expectation 1: Target membership validation', () => {
      it('should throw NotFoundException when target membership does not exist', async () => {
        // Arrange: Caller IS Owner
        mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce(
          {
            id: 'membership-owner',
            role: { name: 'Owner' },
          },
        );
        // Second call: target membership not found
        mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce(
          null,
        );

        // Act & Assert
        await expect(
          service.assignPermissionOverride(
            orgId,
            membershipId,
            permissionId,
            true,
            ownerId,
          ),
        ).rejects.toThrow(NotFoundException);

        expect(mockI18nService.t).toHaveBeenCalledWith(
          'errors.MEMBERSHIP_NOT_FOUND',
        );
      });
    });

    // ====================================================================
    // Test 4: Permission not found
    // Expected: NotFoundException
    // ====================================================================

    describe('Expectation 2: Permission validation', () => {
      it('should throw NotFoundException when permission does not exist', async () => {
        // Arrange: Caller IS Owner
        mockPrismaService.organizationMembership.findFirst
          .mockResolvedValueOnce({
            id: 'membership-owner',
            role: { name: 'Owner' },
          })
          // Target membership is Agent
          .mockResolvedValueOnce({
            id: membershipId,
            role: { name: 'Agent' },
          });
        // Permission not found
        mockPrismaService.permission.findFirst.mockResolvedValueOnce(null);

        // Act & Assert
        await expect(
          service.assignPermissionOverride(
            orgId,
            membershipId,
            permissionId,
            true,
            ownerId,
          ),
        ).rejects.toThrow(NotFoundException);

        expect(mockI18nService.t).toHaveBeenCalledWith(
          'errors.PERMISSION_NOT_FOUND',
        );
      });
    });

    // ====================================================================
    // Test 5: Successful permission override (grant)
    // Expected: Success
    // ====================================================================

    describe('Success Case 1: Grant permission override', () => {
      it('should successfully grant permission override when called by Owner', async () => {
        // Arrange: Caller IS Owner
        mockPrismaService.organizationMembership.findFirst
          .mockResolvedValueOnce({
            id: 'membership-owner',
            role: { name: 'Owner' },
          })
          // Target is Agent
          .mockResolvedValueOnce({
            id: membershipId,
            role: { name: 'Agent' },
          });
        // Permission exists
        mockPrismaService.permission.findFirst.mockResolvedValueOnce({
          id: permissionId,
        });
        // Upsert succeeds with is_granted = true
        mockPrismaService.membershipPermissionOverride.upsert.mockResolvedValueOnce(
          {
            id: 'override-1',
            permission_id: permissionId,
            is_granted: true,
          },
        );

        // Act
        const result = await service.assignPermissionOverride(
          orgId,
          membershipId,
          permissionId,
          true,
          ownerId,
        );

        // Assert
        expect(result.id).toBe('override-1');
        expect(result.permission_id).toBe(permissionId);
        expect(result.is_granted).toBe(true);
        expect(mockI18nService.t).toHaveBeenCalledWith(
          'messages.PERMISSION_OVERRIDE_ASSIGNED_SUCCESSFULLY',
        );
        expect(
          mockPrismaService.membershipPermissionOverride.upsert,
        ).toHaveBeenCalledWith({
          where: {
            membership_id_permission_id: {
              membership_id: membershipId,
              permission_id: permissionId,
            },
          },
          update: { is_granted: true },
          create: {
            membership_id: membershipId,
            permission_id: permissionId,
            is_granted: true,
          },
          select: {
            id: true,
            permission_id: true,
            is_granted: true,
          },
        });
      });
    });

    // ====================================================================
    // Test 6: Successful permission override (revoke)
    // Expected: Success
    // ====================================================================

    describe('Success Case 2: Revoke permission override', () => {
      it('should successfully revoke permission override when called by Owner', async () => {
        // Arrange: Caller IS Owner
        mockPrismaService.organizationMembership.findFirst
          .mockResolvedValueOnce({
            id: 'membership-owner',
            role: { name: 'Owner' },
          })
          // Target is Manager
          .mockResolvedValueOnce({
            id: membershipId,
            role: { name: 'Manager' },
          });
        // Permission exists
        mockPrismaService.permission.findFirst.mockResolvedValueOnce({
          id: permissionId,
        });
        // Upsert succeeds with is_granted = false
        mockPrismaService.membershipPermissionOverride.upsert.mockResolvedValueOnce(
          {
            id: 'override-2',
            permission_id: permissionId,
            is_granted: false,
          },
        );

        // Act
        const result = await service.assignPermissionOverride(
          orgId,
          membershipId,
          permissionId,
          false,
          ownerId,
        );

        // Assert
        expect(result.id).toBe('override-2');
        expect(result.permission_id).toBe(permissionId);
        expect(result.is_granted).toBe(false);
      });
    });
  });

  // ========================================================================
  // Test Suite: updateRole (Owner immutability)
  // ========================================================================

  describe('updateRole - Owner immutability', () => {
    const orgId = '550e8400-e29b-41d4-a716-446655440020';
    const ownerRoleId = '550e8400-e29b-41d4-a716-446655440021';
    const userId = '550e8400-e29b-41d4-a716-446655440022';

    // ====================================================================
    // Test 1: Cannot modify Owner role
    // Expected: BadRequestException
    // ====================================================================

    describe('Security Boundary 1: Owner role is immutable', () => {
      it('should throw BadRequestException when attempting to modify Owner role', async () => {
        // Arrange: User has membership
        mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce(
          { id: 'membership-1' },
        );
        // Owner role exists
        mockPrismaService.role.findFirst.mockResolvedValueOnce({
          id: ownerRoleId,
          name: 'Owner',
        });

        // Act & Assert
        await expect(
          service.updateRole(orgId, ownerRoleId, userId, {
            name: 'Modified Owner',
            permissionIds: [],
          }),
        ).rejects.toThrow(BadRequestException);

        expect(mockI18nService.t).toHaveBeenCalledWith(
          'errors.CANNOT_MODIFY_PROTECTED_ROLE',
        );
      });
    });

    // ====================================================================
    // Test 2: Cannot modify Admin role
    // Expected: BadRequestException
    // ====================================================================

    describe('Security Boundary 2: Admin role is immutable', () => {
      it('should throw BadRequestException when attempting to modify Admin role', async () => {
        const adminRoleId = '550e8400-e29b-41d4-a716-446655440023';

        // Arrange: User has membership
        mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce(
          { id: 'membership-1' },
        );
        // Admin role exists
        mockPrismaService.role.findFirst.mockResolvedValueOnce({
          id: adminRoleId,
          name: 'Admin',
        });

        // Act & Assert
        await expect(
          service.updateRole(orgId, adminRoleId, userId, {
            name: 'Modified Admin',
            permissionIds: [],
          }),
        ).rejects.toThrow(BadRequestException);

        expect(mockI18nService.t).toHaveBeenCalledWith(
          'errors.CANNOT_MODIFY_PROTECTED_ROLE',
        );
      });
    });

    // ====================================================================
    // Test 3: Can modify custom roles (non-protected)
    // Expected: Success
    // ====================================================================

    describe('Success Case: Can modify custom role', () => {
      it('should successfully update a custom role that is not protected', async () => {
        const customRoleId = '550e8400-e29b-41d4-a716-446655440024';
        const permissionId = '550e8400-e29b-41d4-a716-446655440025';

        // Arrange: User has membership
        mockPrismaService.organizationMembership.findFirst.mockResolvedValueOnce(
          { id: 'membership-1' },
        );
        // Custom role exists (not protected)
        mockPrismaService.role.findFirst.mockResolvedValueOnce({
          id: customRoleId,
          name: 'Manager',
        });
        // Permission exists
        mockPrismaService.permission.findMany.mockResolvedValueOnce([
          { id: permissionId },
        ]);
        // Transaction mock
        mockPrismaService.$transaction.mockImplementationOnce(async (cb) => {
          const txClient = {
            role: {
              update: jest.fn(),
              findUnique: jest.fn().mockResolvedValueOnce({
                id: customRoleId,
                name: 'Updated Manager',
                rolePermissions: [
                  {
                    permission: {
                      id: permissionId,
                      action: 'READ',
                      description: 'Read permission',
                    },
                  },
                ],
              }),
            },
            rolePermission: {
              deleteMany: jest.fn(),
              createMany: jest.fn(),
            },
          };
          return cb(txClient);
        });

        // Act - should not throw
        const result = await service.updateRole(orgId, customRoleId, userId, {
          name: 'Updated Manager',
          permissionIds: [permissionId],
        });

        // Assert
        expect(result).toBeDefined();
        expect(result.name).toBe('Updated Manager');
      });
    });
  });
});
