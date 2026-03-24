import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

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
      throw new NotFoundException('User profile not found');
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

    const memberships = await this.prisma.organizationMembership.findMany({
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
    });

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
   * Validates the membership belongs to the user and has 'invited' status
   */
  async acceptOrganizationInvite(userId: string, membershipId: string) {
    this.logger.debug(
      `[UsersService] Processing invite acceptance for membership ${membershipId} by user ${userId}`,
    );

    // Step 1: Verify membership exists and belongs to this user
    const membership = await this.prisma.organizationMembership.findUnique({
      where: { id: membershipId },
      include: {
        organization: { select: { name: true } },
        user: { select: { email: true } },
      },
    });

    if (!membership) {
      throw new NotFoundException(`Invite ${membershipId} not found`);
    }

    // Step 2: Verify membership belongs to the current user
    if (membership.user_id !== userId) {
      this.logger.warn(
        `[UsersService] Unauthorized invite acceptance attempt: User ${userId} tried to accept invite ${membershipId} belonging to user ${membership.user_id}`,
      );
      throw new BadRequestException('This invite does not belong to you');
    }

    // Step 3: Verify membership status is 'invited'
    if (membership.status !== 'invited') {
      throw new BadRequestException(
        `Cannot accept invite with status "${membership.status}". Only "invited" invites can be accepted.`,
      );
    }

    // Step 4: Update status to 'active'
    const updatedMembership = await this.prisma.organizationMembership.update({
      where: { id: membershipId },
      data: {
        status: 'active',
      },
      include: {
        organization: { select: { name: true, slug: true } },
        role: { select: { name: true } },
      },
    });

    this.logger.log(
      `[UsersService] User ${userId} accepted invite to organization "${updatedMembership.organization?.name}"`,
    );

    return {
      message: `Successfully joined organization "${updatedMembership.organization?.name}"`,
      membership_id: updatedMembership.id,
      organization_name: updatedMembership.organization?.name,
      role: updatedMembership.role?.name,
    };
  }
}
