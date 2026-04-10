import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { PrismaService } from '../prisma/prisma.service';
import { RequestContextService } from '../request-context/request-context.service';
import { MembershipStatus } from '@prisma/client';
import { INVITATION_STATUS } from '../constants/invitation-status';
import { UpdateUserProfileDto } from './dtos/update-user-profile.dto';
import { UpdateMemberProfileDto } from './dtos/update-member-profile.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly i18n: I18nService,
    private readonly requestContextService: RequestContextService,
  ) {}

  /**
   * Get the current authenticated user's profile
   */
  async getCurrentUserProfile(userId: string) {
    this.logger.debug(`[UsersService] Fetching profile for user ${userId}`);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        created_at: true,
      },
    });

    if (!user) {
      throw new NotFoundException(
        this.i18n.t('organizations.ERRORS.USER_NOT_FOUND'),
      );
    }

    return user;
  }

  /**
   * Get all organizations the user belongs to
   * Returns memberships with their status, role, and organization details
   */
  async getUserOrganizations(userId: string) {
    this.logger.debug(
      `[UsersService] Fetching organizations for user ${userId}`,
    );

    const memberships = await this.requestContextService.runWithBypass(() =>
      this.prisma.organizationMembership.findMany({
        where: {
          user_id: userId,
        },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
              is_public: true,
              created_at: true,
            },
          },
          role: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          created_at: 'desc',
        },
      }),
    );

    return memberships.map((membership) => ({
      membership_id: membership.id,
      organization_id: membership.organization_id,
      role_id: membership.role_id,
      status: membership.status,
      created_at: membership.created_at,
      organization: membership.organization,
      role: membership.role,
    }));
  }

  /**
   * Accept a pending organization invite
   * Validates invitation belongs to the user's email and creates active membership
   */
  async acceptOrganizationInvite(userId: string, inviteId: string) {
    this.logger.debug(
      `[UsersService] Processing invite acceptance for invitation ${inviteId} by user ${userId}`,
    );

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    if (!user) {
      throw new NotFoundException(
        this.i18n.t('organizations.ERRORS.USER_NOT_FOUND'),
      );
    }

    // Step 1: Verify invitation exists
    const invitation = await this.requestContextService.runWithBypass(() =>
      this.prisma.invitation.findUnique({
        where: { id: inviteId },
        include: {
          organization: { select: { id: true, name: true, slug: true } },
          role: { select: { id: true, name: true } },
        },
      }),
    );

    if (!invitation) {
      throw new NotFoundException(
        this.i18n.t('organizations.ERRORS.INVITATION.NOT_FOUND'),
      );
    }

    // Step 2: Verify invitation belongs to the current user's email
    if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
      this.logger.warn(
        `[UsersService] Unauthorized invite acceptance attempt: User ${userId} tried to accept invite ${inviteId} for email ${invitation.email}`,
      );
      throw new BadRequestException(
        this.i18n.t('organizations.ERRORS.INVITATION.NOT_OWNER'),
      );
    }

    // Step 3: Verify invitation status is pending
    if (invitation.status !== INVITATION_STATUS.PENDING) {
      throw new BadRequestException(
        this.i18n.t('organizations.ERRORS.INVITATION.INVALID_STATUS', {
          args: { status: invitation.status },
        }),
      );
    }

    // Step 4: Ensure user is not already a member of this organization
    const existingMembership = await this.requestContextService.runWithBypass(
      () =>
        this.prisma.organizationMembership.findFirst({
          where: {
            user_id: user.id,
            organization_id: invitation.organization_id,
          },
        }),
    );

    if (existingMembership) {
      throw new ConflictException(
        this.i18n.t('organizations.ERRORS.ORG.USER_ALREADY_MEMBER'),
      );
    }

    // Step 5: Create membership from invitation role and mark invitation accepted
    const createdMembership = await this.requestContextService.runWithBypass(
      () =>
        this.prisma.$transaction(async (tx) => {
          const membership = await tx.organizationMembership.create({
            data: {
              user_id: user.id,
              organization_id: invitation.organization_id,
              role_id: invitation.role_id,
              status: MembershipStatus.ACTIVE,
            },
            include: {
              organization: { select: { name: true, slug: true } },
              role: { select: { name: true } },
            },
          });

          await tx.invitation.update({
            where: { id: inviteId },
            data: {
              status: INVITATION_STATUS.ACCEPTED,
              accepted_at: new Date(),
            },
          });

          return membership;
        }),
    );

    this.logger.log(
      `[UsersService] User ${userId} accepted invite ${inviteId} to organization "${createdMembership.organization?.name}"`,
    );

    return {
      message: this.i18n.t('organizations.ERRORS.INVITATION.ACCEPT_SUCCESS', {
        args: { organizationName: createdMembership.organization?.name ?? '' },
      }),
      membership_id: createdMembership.id,
      organization_name: createdMembership.organization?.name,
      role: createdMembership.role?.name,
    };
  }

  /**
   * Cancel the current user's pending join request.
   * Deletes the membership so the user can join a different workspace.
   */
  async cancelJoinRequest(
    userId: string,
    membershipId: string,
  ): Promise<{ message: string }> {
    this.logger.debug(
      `[UsersService] Cancelling join request ${membershipId} for user ${userId}`,
    );

    const membership = await this.requestContextService.runWithBypass(() =>
      this.prisma.organizationMembership.findUnique({
        where: { id: membershipId },
        select: {
          id: true,
          user_id: true,
          status: true,
        },
      }),
    );
    if (!membership) {
      throw new NotFoundException(
        this.i18n.t('organizations.ERRORS.ORG.MEMBERSHIP_REQUEST_NOT_FOUND'),
      );
    }

    if (membership.user_id !== userId) {
      throw new ForbiddenException(
        this.i18n.t('organizations.ERRORS.ORG.MEMBERSHIP_CANCEL_FORBIDDEN'),
      );
    }

    const membershipStatus = String(membership.status);

    if (membershipStatus !== String(MembershipStatus.PENDING)) {
      throw new BadRequestException(
        this.i18n.t('organizations.ERRORS.ORG.MEMBERSHIP_CANCEL_ONLY_PENDING'),
      );
    }

    await this.requestContextService.runWithBypass(() =>
      this.prisma.organizationMembership.delete({
        where: { id: membershipId },
      }),
    );

    return {
      message: this.i18n.t(
        'organizations.ERRORS.ORG.MEMBERSHIP_CANCELLED_SUCCESS',
      ),
    };
  }

  /**
   * Calculate a user's effective permissions for an organization
   *
   * Process:
   * 1. Guard: If no organizationId, return []
   * 2. Query the user's OrganizationMembership with its Role and RolePermissions
   * 3. If membership is null, return []
   * 4. Query MembershipPermissionOverride records for this membership
   * 5. Start with base role permissions (Set)
   * 6. Apply overrides: add if is_granted=true, remove if is_granted=false
   * 7. Return sorted array of permission action strings
   */
  async getEffectivePermissions(
    userId: string,
    organizationId?: string,
  ): Promise<string[]> {
    // Guard clause: if no organization ID provided, return empty permissions
    if (!organizationId) {
      this.logger.debug(
        `[UsersService] No organization ID provided for user ${userId}, returning empty permissions`,
      );
      return [];
    }

    this.logger.debug(
      `[UsersService] Calculating effective permissions for user ${userId} in organization ${organizationId}`,
    );

    // Query 1: Get the membership with role and role permissions
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        user_id: userId,
        organization_id: organizationId,
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
      },
    });

    if (!membership) {
      this.logger.debug(
        `[UsersService] No membership found for user ${userId} in organization ${organizationId}`,
      );
      return [];
    }

    // Start with base role permissions in a Set
    const permissionsSet = new Set<string>();
    membership.role.rolePermissions.forEach((rp) => {
      permissionsSet.add(rp.permission.action);
    });

    // Query 2: Get membership-level overrides
    const overrides = await this.prisma.membershipPermissionOverride.findMany({
      where: {
        membership_id: membership.id,
      },
      include: {
        permission: {
          select: {
            action: true,
          },
        },
      },
    });

    // Apply overrides to the set
    overrides.forEach((override) => {
      if (override.is_granted) {
        permissionsSet.add(override.permission.action);
      } else {
        permissionsSet.delete(override.permission.action);
      }
    });

    const result = Array.from(permissionsSet).sort();
    this.logger.debug(
      `[UsersService] User ${userId} has ${result.length} permissions in organization ${organizationId}`,
    );
    return result;
  }

  /**
   * Get performance dashboard profile including user, membership, and calculated metrics
   * Calculates MTD revenue (Month-to-Date) and active pipeline value
   */
  async getPerformanceProfile(userId: string, organizationId: string) {
    this.logger.debug(
      `[UsersService] Fetching performance profile for user ${userId} in organization ${organizationId}`,
    );

    // Fetch user and membership
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        avatar_url: true,
        phone_number: true,
        whatsapp_number: true,
        spoken_languages: true,
        created_at: true,
      },
    });

    if (!user) {
      throw new NotFoundException(
        this.i18n.t('organizations.ERRORS.USER_NOT_FOUND'),
      );
    }

    // Fetch membership
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        user_id: userId,
        organization_id: organizationId,
      },
      select: {
        id: true,
        job_title: true,
        agent_tier: true,
        specializations: true,
        availability_status: true,
        max_active_leads: true,
        commission_rate: true,
        monthly_revenue_target: true,
        status: true,
        created_at: true,
      },
    });

    if (!membership) {
      throw new NotFoundException(
        this.i18n.t('organizations.ERRORS.MEMBERSHIP_NOT_FOUND'),
      );
    }

    // Calculate MTD closed revenue (Month-to-Date)
    const firstDayOfMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    );

    const mtdRevenueResult = await this.prisma.lead.aggregate({
      where: {
        assigned_agent_id: userId,
        organization_id: organizationId,
        status: 'WON',
        updated_at: {
          gte: firstDayOfMonth,
        },
      },
      _sum: {
        estimated_value: true,
      },
    });

    // Calculate active pipeline value
    const activePipelineResult = await this.prisma.lead.aggregate({
      where: {
        assigned_agent_id: userId,
        organization_id: organizationId,
        status: 'OPEN',
      },
      _sum: {
        estimated_value: true,
      },
    });

    return {
      user,
      membership,
      metrics: {
        closed_revenue_mtd: mtdRevenueResult._sum.estimated_value ?? 0,
        active_pipeline_value: activePipelineResult._sum.estimated_value ?? 0,
      },
    };
  }

  /**
   * Update user's global profile information
   * Applies to all organizations the user is a member of
   */
  async updateGlobalProfile(userId: string, data: UpdateUserProfileDto) {
    this.logger.debug(
      `[UsersService] Updating global profile for user ${userId}`,
    );

    const updateData: Record<string, any> = {};

    if (data.avatar_url !== undefined) updateData.avatar_url = data.avatar_url;
    if (data.phone_number !== undefined)
      updateData.phone_number = data.phone_number;
    if (data.whatsapp_number !== undefined)
      updateData.whatsapp_number = data.whatsapp_number;
    if (data.spoken_languages !== undefined)
      updateData.spoken_languages = data.spoken_languages;

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        avatar_url: true,
        phone_number: true,
        whatsapp_number: true,
        spoken_languages: true,
        created_at: true,
      },
    });

    this.logger.debug(
      `[UsersService] Global profile updated for user ${userId}`,
    );
    return updatedUser;
  }

  /**
   * Update user's membership profile for a specific organization
   * Organization-specific profile information like tier, specializations, etc.
   *
   * Security: Sensitive fields (commission_rate, monthly_revenue_target, agent_tier)
   * can only be updated by users with 'members:manage' permission.
   */
  async updateMembershipProfile(
    userId: string,
    organizationId: string,
    data: UpdateMemberProfileDto,
  ) {
    this.logger.debug(
      `[UsersService] Updating membership profile for user ${userId} in organization ${organizationId}`,
    );

    // Check if sensitive fields are being updated
    const sensitiveFields = [
      'commission_rate',
      'monthly_revenue_target',
      'agent_tier',
    ];
    const hasSensitiveFields = sensitiveFields.some(
      (field) => data[field as keyof UpdateMemberProfileDto] !== undefined,
    );

    // If sensitive fields are present, verify user has permission
    if (hasSensitiveFields) {
      const permissions = await this.getEffectivePermissions(
        userId,
        organizationId,
      );
      if (!permissions.includes('members:manage')) {
        this.logger.warn(
          `[UsersService] Unauthorized attempt to update sensitive membership fields by user ${userId} in organization ${organizationId}`,
        );
        throw new ForbiddenException(
          this.i18n.t(
            'organizations.ERRORS.ONLY_OWNER_CAN_PERFORM_THIS_ACTION',
          ),
        );
      }
    }

    const updateData: Record<string, any> = {};

    if (data.job_title !== undefined) updateData.job_title = data.job_title;
    if (data.agent_tier !== undefined)
      updateData.agent_tier = data.agent_tier as string;
    if (data.specializations !== undefined)
      updateData.specializations = data.specializations;
    if (data.availability_status !== undefined)
      updateData.availability_status = data.availability_status as string;
    if (data.max_active_leads !== undefined)
      updateData.max_active_leads = data.max_active_leads;
    if (data.commission_rate !== undefined)
      updateData.commission_rate = data.commission_rate;
    if (data.monthly_revenue_target !== undefined)
      updateData.monthly_revenue_target = data.monthly_revenue_target;

    await this.prisma.organizationMembership.updateMany({
      where: {
        user_id: userId,
        organization_id: organizationId,
      },
      data: updateData,
    });

    // Fetch and return the updated membership for response
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        user_id: userId,
        organization_id: organizationId,
      },
      select: {
        id: true,
        job_title: true,
        agent_tier: true,
        specializations: true,
        availability_status: true,
        max_active_leads: true,
        commission_rate: true,
        monthly_revenue_target: true,
        status: true,
        created_at: true,
      },
    });

    this.logger.debug(
      `[UsersService] Membership profile updated for user ${userId} in organization ${organizationId}`,
    );
    return membership;
  }
}
