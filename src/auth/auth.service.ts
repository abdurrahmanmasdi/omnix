import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { I18nService } from 'nestjs-i18n';
import * as bcrypt from 'bcryptjs';

interface IUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  created_at: Date;
}

interface ILoginResponse {
  access_token: string;
  user: IUser & { permissions: string[] };
}

function excludePassword(user: any): IUser {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unused-vars
  const { password_hash, ...rest } = user;
  return rest as IUser;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private i18n: I18nService,
  ) {}

  async validateUser(email: string, password: string): Promise<IUser | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return null;
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return null;
    return excludePassword(user);
  }

  async login(user: IUser): Promise<ILoginResponse> {
    this.logger.debug(`[AuthService] Login for user ${user.id}`);

    // Get user's first (oldest by creation date) active organization membership
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        user_id: user.id,
        status: 'ACTIVE',
      },
      orderBy: {
        created_at: 'asc',
      },
    });

    // If user has no active membership, return empty permissions
    if (!membership) {
      this.logger.debug(
        `[AuthService] No active membership found for user ${user.id}`,
      );
      const payload = { sub: user.id, email: user.email };
      return {
        access_token: this.jwtService.sign(payload),
        user: { ...user, permissions: [] },
      };
    }

    // Calculate effective permissions for the user's primary organization
    const effectivePermissions = await this.getEffectivePermissions(
      user.id,
      membership.organization_id,
    );

    const payload = { sub: user.id, email: user.email };
    return {
      access_token: this.jwtService.sign(payload),
      user: { ...user, permissions: effectivePermissions },
    };
  }

  /**
   * Calculate a user's effective permissions for an organization
   *
   * Process:
   * 1. Guard: If no organizationId, return []
   * 2. Query the user's OrganizationMembership with its Role and RolePermissions
   * 3. If membership is null, return []
   * 4. Query MembershipPermissionOv overrides for this membership
   * 5. Start with base role permissions (Set)
   * 6. Apply overrides: add if is_granted=true, remove if is_granted=false
   * 7. Return sorted array of permission action strings
   */
  async getEffectivePermissions(
    userId: string,
    organizationId: string,
  ): Promise<string[]> {
    // Guard clause: if no organization ID provided, return empty permissions
    if (!organizationId) {
      this.logger.debug(
        `[AuthService] No organization ID provided for user ${userId}, returning empty permissions`,
      );
      return [];
    }

    this.logger.debug(
      `[AuthService] Calculating effective permissions for user ${userId} in organization ${organizationId}`,
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
        `[AuthService] No membership found for user ${userId} in organization ${organizationId}`,
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
      `[AuthService] User ${userId} has ${result.length} permissions in organization ${organizationId}`,
    );
    return result;
  }

  async register(
    email: string,
    password: string,
    first_name: string,
    last_name: string,
  ): Promise<IUser> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new BadRequestException(
        this.i18n.t('errors.AUTH.USER_ALREADY_EXISTS'),
      );
    }
    const hashed = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({
      data: { email, password_hash: hashed, first_name, last_name },
    });
    return excludePassword(user);
  }
}
