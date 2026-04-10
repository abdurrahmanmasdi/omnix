import {
  Injectable,
  BadRequestException,
  Logger,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthTokenType, MembershipStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { I18nService } from 'nestjs-i18n';
import * as bcrypt from 'bcryptjs';
import { INVITATION_STATUS } from '../constants/invitation-status';
import { RequestContextService } from '../request-context/request-context.service';
import { TokenManagementService } from './services/token-management.service';
import { MailingService } from './services/mailing.service';

const ACCESS_TOKEN_EXPIRES_IN = '15m';
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TOKEN_TTL_MS = 15 * 60 * 1000;
const VERIFY_EMAIL_SUCCESS_MESSAGE = 'Email verified';
const GENERIC_VERIFICATION_RESEND_MESSAGE =
  'If an account exists, a link has been sent';

interface IUserPublic {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  created_at: Date;
}

interface IValidatedUser extends IUserPublic {
  is_email_verified: boolean;
}

interface ILoginResponse {
  access_token: string;
  refresh_token: string;
  user: IUserPublic & { permissions: string[] };
}

interface IRefreshSessionResponse {
  access_token: string;
  refresh_token: string;
}

interface IJwtAccessPayload {
  sub: string;
  email: string;
  first_name: string;
  last_name: string;
  created_at: string;
}

interface InvitationTokenRecord {
  id: string;
  email: string;
  status: string;
  organization_id: string;
  role_id: string;
}

function excludePassword(user: any): IValidatedUser {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unused-vars
  const { password_hash, ...rest } = user;
  return rest as IValidatedUser;
}

function toPublicUser(user: IValidatedUser): IUserPublic {
  return {
    id: user.id,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    created_at: user.created_at,
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private i18n: I18nService,
    private tokenManagementService: TokenManagementService,
    private mailingService: MailingService,
    private requestContextService: RequestContextService,
  ) {}

  async validateUser(
    email: string,
    password: string,
  ): Promise<IValidatedUser | null> {
    const user = await this.prisma.user.findFirst({
      where: {
        email,
        deleted_at: null,
      },
    });
    if (!user) return null;
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return null;
    return excludePassword(user);
  }

  async login(user: IValidatedUser): Promise<ILoginResponse> {
    return this.requestContextService.runWithBypass(async () => {
      this.logger.debug(`[AuthService] Login for user ${user.id}`);

      if (!user.is_email_verified) {
        throw new ForbiddenException(
          this.i18n.t('auth.ERRORS.EMAIL_NOT_VERIFIED'),
        );
      }

      const publicUser = toPublicUser(user);

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
        const refreshToken = await this.tokenManagementService.issueToken(
          user.id,
          AuthTokenType.REFRESH,
          REFRESH_TOKEN_TTL_MS,
        );
        return {
          access_token: this.signAccessToken(publicUser),
          refresh_token: refreshToken,
          user: { ...publicUser, permissions: [] },
        };
      }

      // Calculate effective permissions for the user's primary organization
      const effectivePermissions = await this.getEffectivePermissions(
        user.id,
        membership.organization_id,
      );

      const refreshToken = await this.tokenManagementService.issueToken(
        user.id,
        AuthTokenType.REFRESH,
        REFRESH_TOKEN_TTL_MS,
      );

      return {
        access_token: this.signAccessToken(publicUser),
        refresh_token: refreshToken,
        user: { ...publicUser, permissions: effectivePermissions },
      };
    });
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
    inviteToken?: string,
  ): Promise<IUserPublic> {
    return this.requestContextService.runWithBypass(async () => {
      const existing = await this.prisma.user.findFirst({
        where: {
          email,
          deleted_at: null,
        },
      });
      if (existing) {
        throw new BadRequestException(
          this.i18n.t('auth.ERRORS.USER_ALREADY_EXISTS'),
        );
      }

      const hashed = await bcrypt.hash(password, 10);

      if (!inviteToken) {
        const user = await this.prisma.user.create({
          data: {
            email,
            password_hash: hashed,
            first_name,
            last_name,
            is_email_verified: false,
          },
        });
        await this.sendVerificationToken(user.id, user.email);
        return toPublicUser(excludePassword(user));
      }

      const user = await this.prisma.$transaction(async (tx) => {
        const invitation = await tx.invitation.findFirst({
          where: { token: inviteToken },
          select: {
            id: true,
            email: true,
            status: true,
            organization_id: true,
            role_id: true,
          },
        });

        const validInvitation = this.validateInvitationForRegistration(
          invitation,
          email,
        );

        const invitationUpdate = await tx.invitation.updateMany({
          where: {
            id: validInvitation.id,
            status: INVITATION_STATUS.PENDING,
          },
          data: {
            status: INVITATION_STATUS.ACCEPTED,
            accepted_at: new Date(),
          },
        });

        if (invitationUpdate.count !== 1) {
          throw new BadRequestException(
            this.i18n.t('organizations.ERRORS.INVITATION.INVALID_STATUS', {
              args: { status: validInvitation.status },
            }),
          );
        }

        const createdUser = await tx.user.create({
          data: {
            email,
            password_hash: hashed,
            first_name,
            last_name,
            is_email_verified: false,
          },
        });

        await tx.organizationMembership.create({
          data: {
            user_id: createdUser.id,
            organization_id: validInvitation.organization_id,
            role_id: validInvitation.role_id,
            status: MembershipStatus.ACTIVE,
          },
        });

        return createdUser;
      });

      await this.sendVerificationToken(user.id, user.email);

      return toPublicUser(excludePassword(user));
    });
  }

  async verifyEmail(rawToken: string): Promise<{ message: string }> {
    return this.requestContextService.runWithBypass(async () => {
      const userId = await this.tokenManagementService.validateAndRevokeToken(
        null,
        rawToken,
        AuthTokenType.VERIFICATION,
      );

      await this.prisma.user.update({
        where: { id: userId },
        data: { is_email_verified: true },
      });

      return { message: VERIFY_EMAIL_SUCCESS_MESSAGE };
    });
  }

  async resendVerification(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findFirst({
      where: {
        email,
        deleted_at: null,
      },
      select: {
        id: true,
        email: true,
        is_email_verified: true,
      },
    });

    if (!user || user.is_email_verified) {
      return { message: GENERIC_VERIFICATION_RESEND_MESSAGE };
    }

    await this.tokenManagementService.revokeAllUserTokens(
      user.id,
      AuthTokenType.VERIFICATION,
    );

    await this.sendVerificationToken(user.id, user.email);

    return { message: GENERIC_VERIFICATION_RESEND_MESSAGE };
  }

  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: {
        email,
        deleted_at: null,
      },
      select: {
        id: true,
        email: true,
      },
    });

    // Deliberately silent to avoid account enumeration.
    if (!user) {
      return;
    }

    const resetToken = await this.tokenManagementService.issueToken(
      user.id,
      AuthTokenType.RESET,
      PASSWORD_RESET_TOKEN_TTL_MS,
    );

    await this.mailingService.sendPasswordResetEmail(user.email, resetToken);
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const userId = await this.tokenManagementService.consumeToken(
      rawToken,
      AuthTokenType.RESET,
    );
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password_hash: newPasswordHash,
      },
    });

    await this.tokenManagementService.revokeAllUserTokens(
      userId,
      AuthTokenType.REFRESH,
    );
  }

  async refreshAccessToken(
    rawRefreshToken: string,
  ): Promise<IRefreshSessionResponse> {
    const userId = await this.tokenManagementService.consumeToken(
      rawRefreshToken,
      AuthTokenType.REFRESH,
    );

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        created_at: true,
        is_email_verified: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException(
        this.i18n.t('auth.ERRORS.INVALID_CREDENTIALS'),
      );
    }

    if (!user.is_email_verified) {
      throw new ForbiddenException(
        this.i18n.t('auth.ERRORS.EMAIL_NOT_VERIFIED'),
      );
    }

    const nextRefreshToken = await this.tokenManagementService.issueToken(
      user.id,
      AuthTokenType.REFRESH,
      REFRESH_TOKEN_TTL_MS,
    );

    return {
      access_token: this.signAccessToken(toPublicUser(user)),
      refresh_token: nextRefreshToken,
    };
  }

  async logout(rawRefreshToken?: string): Promise<void> {
    if (!rawRefreshToken) {
      return;
    }

    await this.tokenManagementService.revokeTokenIfExists(
      rawRefreshToken,
      AuthTokenType.REFRESH,
    );
  }

  private signAccessToken(user: IUserPublic): string {
    return this.jwtService.sign(this.toJwtPayload(user), {
      expiresIn: ACCESS_TOKEN_EXPIRES_IN,
    });
  }

  private toJwtPayload(user: IUserPublic): IJwtAccessPayload {
    return {
      sub: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      created_at: user.created_at.toISOString(),
    };
  }

  private async sendVerificationToken(
    userId: string,
    email: string,
  ): Promise<void> {
    const verificationToken = await this.tokenManagementService.issueToken(
      userId,
      AuthTokenType.VERIFICATION,
      VERIFICATION_TOKEN_TTL_MS,
    );

    await this.mailingService.sendVerificationEmail(email, verificationToken);
  }

  private validateInvitationForRegistration(
    invitation: InvitationTokenRecord | null,
    email: string,
  ): InvitationTokenRecord {
    if (!invitation) {
      throw new NotFoundException(
        this.i18n.t('organizations.ERRORS.INVITATION.NOT_FOUND'),
      );
    }

    if (invitation.status !== INVITATION_STATUS.PENDING) {
      throw new BadRequestException(
        this.i18n.t('organizations.ERRORS.INVITATION.INVALID_STATUS', {
          args: { status: invitation.status },
        }),
      );
    }

    if (invitation.email.toLowerCase() !== email.toLowerCase()) {
      throw new BadRequestException(
        this.i18n.t('organizations.ERRORS.INVITATION.NOT_OWNER'),
      );
    }

    return invitation;
  }
}
