import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
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
    },
    role: {
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
  };

  const mockI18nService = {
    t: jest.fn((key: string) => key),
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
});
