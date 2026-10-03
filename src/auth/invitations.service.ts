import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { isEmail } from 'class-validator';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { AcceptClinicInvitationDto } from './dto/accept-clinic-invitation.dto';
import { IssueClinicInvitationDto } from './dto/issue-clinic-invitation.dto';
import { tenantStorage } from '../core/tenant/tenant.context';
import { Prisma } from '@prisma/client';
import {
  MEMBERSHIP_GRANTS_INCLUDE,
  membershipHasPermission,
} from './permission.service';

const PURPOSE = 'PILOT_ACTIVATION';
const CLINIC_MEMBERSHIP_PURPOSE = 'CLINIC_MEMBERSHIP';
// Activation event marking the clinic invitation that created a new identity and may set its password.
const IDENTITY_CREATED = 'IDENTITY_CREATED';

const digest = (purpose: string, token: string) =>
  createHash('sha256').update(`${purpose}:${token}`).digest('hex');

const invalid = () =>
  new UnauthorizedException(
    'Invitation is invalid, expired, or already used. Request a new invitation from your pilot contact.',
  );

const invalidClinic = () =>
  new UnauthorizedException(
    'Clinic invitation is invalid, expired, or already used.',
  );

@Injectable()
export class InvitationsService {
  constructor(private readonly prisma: PrismaService) {}

  // Operator-only CLI entry point: deliberately not exposed through an HTTP route.
  async issue(email: string, operator: string) {
    email = email.trim().toLowerCase();
    if (!isEmail(email) || !operator.trim() || operator.length > 120) {
      throw new BadRequestException('INVITATION_INPUT_INVALID');
    }
    return tenantStorage.run({ isSystemBypass: true }, () =>
      this.prisma.$transaction(async (tx) => {
        const existing = await tx.user.findFirst({
          where: { email: { equals: email, mode: 'insensitive' } },
        });
        const user =
          existing ??
          (await tx.user.create({
            data: {
              email,
              password_hash: '!INVITATION_PENDING',
              firstName: '',
              lastName: '',
              status: 'PENDING',
            },
          }));
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid FOR UPDATE`;
        const current = await tx.user.findUniqueOrThrow({
          where: { id: user.id },
        });
        if (current.status !== 'PENDING' || current.deletedAt)
          throw new ConflictException('INVITATION_ACCOUNT_NOT_PENDING');
        const latest = await tx.accountInvitation.findFirst({
          where: { userId: user.id },
          orderBy: { createdAt: 'desc' },
        });
        const now = new Date();
        if (latest && now.getTime() - latest.createdAt.getTime() < 60_000) {
          throw new ConflictException('INVITATION_ISSUE_RATE_LIMIT');
        }
        const revoked = await tx.accountInvitation.findMany({
          where: { userId: user.id, consumedAt: null, revokedAt: null },
        });
        await tx.accountInvitation.updateMany({
          where: { userId: user.id, consumedAt: null, revokedAt: null },
          data: { revokedAt: now },
        });
        for (const previous of revoked) {
          await tx.accountActivationEvent.create({
            data: {
              userId: user.id,
              invitationId: previous.id,
              action: 'REVOKED',
              actor: operator,
            },
          });
        }
        const token = randomBytes(32).toString('hex');
        const invitation = await tx.accountInvitation.create({
          data: {
            userId: user.id,
            tokenHash: digest(PURPOSE, token),
            purpose: PURPOSE,
            issuedBy: operator,
            expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
          },
        });
        await tx.accountActivationEvent.create({
          data: {
            userId: user.id,
            invitationId: invitation.id,
            action: 'ISSUED',
            actor: operator,
          },
        });
        return {
          invitationId: invitation.id,
          userId: user.id,
          token,
          expiresAt: invitation.expiresAt,
        };
      }),
    );
  }

  async revoke(invitationId: string, operator: string) {
    if (!operator.trim() || operator.length > 120)
      throw new BadRequestException('INVITATION_INPUT_INVALID');
    return tenantStorage.run({ isSystemBypass: true }, () =>
      this.prisma.$transaction(async (tx) => {
        const invitation = await tx.accountInvitation.findUnique({
          where: { id: invitationId },
        });
        if (!invitation) throw new BadRequestException('INVITATION_NOT_FOUND');
        const changed = await tx.accountInvitation.updateMany({
          where: { id: invitationId, consumedAt: null, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        if (changed.count)
          await tx.accountActivationEvent.create({
            data: {
              userId: invitation.userId,
              invitationId,
              action: 'REVOKED',
              actor: operator,
            },
          });
        return { revoked: changed.count === 1 };
      }),
    );
  }

  async accept(dto: AcceptInvitationDto) {
    return tenantStorage.run({ isSystemBypass: true }, async () => {
      if (!/^[a-f0-9]{64}$/.test(dto.token)) throw invalid();
      if (Buffer.byteLength(dto.password, 'utf8') > 72)
        throw new BadRequestException(
          'Password must not exceed 72 UTF-8 bytes',
        );
      const tokenHash = digest(PURPOSE, dto.token);
      // Check the random capability before expensive password hashing; check again under lock.
      const invitation = await this.prisma.accountInvitation.findUnique({
        where: { tokenHash },
      });
      if (
        !invitation ||
        invitation.purpose !== PURPOSE ||
        invitation.consumedAt ||
        invitation.revokedAt ||
        invitation.expiresAt <= new Date()
      )
        throw invalid();
      const passwordHash = await bcrypt.hash(dto.password, 12);
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${invitation.userId}::uuid FOR UPDATE`;
        const user = await tx.user.findUnique({
          where: { id: invitation.userId },
        });
        if (!user || user.status !== 'PENDING' || user.deletedAt)
          throw invalid();
        const now = new Date();
        const claim = await tx.accountInvitation.updateMany({
          where: {
            id: invitation.id,
            tokenHash,
            purpose: PURPOSE,
            consumedAt: null,
            revokedAt: null,
            expiresAt: { gt: now },
          },
          data: { consumedAt: now },
        });
        if (claim.count !== 1) throw invalid();
        await tx.user.update({
          where: { id: user.id },
          data: {
            status: 'ACTIVE',
            password_hash: passwordHash,
            firstName: dto.firstName,
            lastName: dto.lastName,
          },
        });
        await tx.accountActivationEvent.create({
          data: {
            userId: user.id,
            invitationId: invitation.id,
            action: 'ACCEPTED',
            actor: 'invited-user',
          },
        });
      });
      return {
        message: 'Account activated. Log in with your invited email address.',
      };
    });
  }

  async issueClinicInvitation(
    dto: IssueClinicInvitationDto,
    issuerUserId: string,
    organizationId: string,
  ) {
    const email = dto.email.trim().toLowerCase();
    return this.prisma.$transaction(async (tx) => {
      // Check that the target organization is active
      const org = await tx.organization.findUnique({
        where: { id: organizationId },
      });
      if (!org || org.deleted_at) {
        throw new BadRequestException('Organization is inactive or not found.');
      }

      const role = await tx.role.findFirst({
        where: {
          id: dto.roleId,
          deletedAt: null,
          OR: [{ organizationId }, { organizationId: null }],
        },
        include: { rolePermissions: { include: { permission: true } } },
      });
      if (!role) throw new BadRequestException('ROLE_NOT_FOUND');

      // Reject arbitrary role fields (e.g. escalating to Super Admin incorrectly)
      if (role.name === 'Super Admin') {
        throw new BadRequestException('Cannot invite users as Super Admin.');
      }

      // Check issuer membership
      const issuerMembership = await tx.organizationMembership.findFirst({
        where: {
          userId: issuerUserId,
          organizationId,
          status: 'ACTIVE',
          deletedAt: null,
        },
        include: MEMBERSHIP_GRANTS_INCLUDE,
      });
      if (!issuerMembership)
        throw new UnauthorizedException('Issuer is not a member of the clinic');

      // The issuer may only grant permissions they hold themselves (overrides included).
      const exceeds = role.rolePermissions.some(
        (grant) =>
          !membershipHasPermission(issuerMembership, grant.permission.action),
      );
      if (exceeds)
        throw new ForbiddenException('INVITATION_ROLE_EXCEEDS_ISSUER');

      const existing = await tx.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
      });
      const user =
        existing ??
        (await tx.user.create({
          data: {
            email,
            password_hash: '!INVITATION_PENDING',
            firstName: '',
            lastName: '',
            status: 'PENDING',
          },
        }));
      // Only an identity this clinic created may be activated (password set) through its invitation.
      // Any other existing identity, PENDING or ACTIVE, joins only by authenticated acceptance (KI-027).
      const ownsIdentity =
        !existing ||
        (existing.status === 'PENDING' &&
          (await this.identityCreatedByClinic(
            tx,
            existing.id,
            organizationId,
          )));

      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid FOR UPDATE`;

      const membership = await tx.organizationMembership.findUnique({
        where: { userId_organizationId: { userId: user.id, organizationId } },
      });
      if (membership)
        throw new ConflictException('User is already a member of this clinic.');

      const now = new Date();
      const revoked = await tx.accountInvitation.findMany({
        where: {
          userId: user.id,
          organizationId,
          consumedAt: null,
          revokedAt: null,
        },
      });
      await tx.accountInvitation.updateMany({
        where: {
          userId: user.id,
          organizationId,
          consumedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
      for (const previous of revoked) {
        await tx.accountActivationEvent.create({
          data: {
            userId: user.id,
            invitationId: previous.id,
            action: 'REVOKED',
            actor: issuerUserId,
          },
        });
      }

      const token = randomBytes(32).toString('hex');
      const invitation = await tx.accountInvitation.create({
        data: {
          userId: user.id,
          organizationId,
          roleId: dto.roleId,
          tokenHash: digest(CLINIC_MEMBERSHIP_PURPOSE, token),
          purpose: CLINIC_MEMBERSHIP_PURPOSE,
          issuedBy: issuerUserId,
          expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      });

      await tx.accountActivationEvent.create({
        data: {
          userId: user.id,
          invitationId: invitation.id,
          action: 'ISSUED',
          actor: issuerUserId,
        },
      });
      if (ownsIdentity) {
        await tx.accountActivationEvent.create({
          data: {
            userId: user.id,
            invitationId: invitation.id,
            action: IDENTITY_CREATED,
            actor: issuerUserId,
          },
        });
      }

      return {
        invitationId: invitation.id,
        token,
        expiresAt: invitation.expiresAt,
        // false: the invitee must log in to their own existing account to accept.
        createsAccount: ownsIdentity,
      };
    });
  }

  async acceptClinicInvitation(
    dto: AcceptClinicInvitationDto,
    authenticatedUserId?: string,
  ) {
    return tenantStorage.run({ isSystemBypass: true }, async () => {
      if (!/^[a-f0-9]{64}$/.test(dto.token)) throw invalidClinic();

      const tokenHash = digest(CLINIC_MEMBERSHIP_PURPOSE, dto.token);
      const invitation = await this.prisma.accountInvitation.findUnique({
        where: { tokenHash },
      });

      if (
        !invitation ||
        invitation.purpose !== CLINIC_MEMBERSHIP_PURPOSE ||
        invitation.consumedAt ||
        invitation.revokedAt ||
        invitation.expiresAt <= new Date() ||
        !invitation.organizationId ||
        !invitation.roleId
      ) {
        throw invalidClinic();
      }

      // "For an existing account, require authenticated acceptance matching the invited identity; do not reset its password."
      // "For a new account, safely activate and join the intended clinic. Never let the browser supply a different clinic, email or role at acceptance."

      return this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${invitation.userId}::uuid FOR UPDATE`;
        const user = await tx.user.findUnique({
          where: { id: invitation.userId },
        });
        if (!user || user.deletedAt) throw invalidClinic();

        const org = await tx.organization.findUnique({
          where: { id: invitation.organizationId! },
        });
        if (!org || org.deleted_at)
          throw new UnauthorizedException('Clinic is inactive or deleted.');

        let passwordHash = user.password_hash;
        let firstName = user.firstName;
        let lastName = user.lastName;

        if (user.status === 'ACTIVE') {
          if (!authenticatedUserId) {
            throw new UnauthorizedException(
              'You must log in to accept this invitation.',
            );
          }
          if (authenticatedUserId !== user.id) {
            throw new UnauthorizedException(
              'You are logged in as a different user than the invited identity.',
            );
          }
        } else if (user.status === 'PENDING') {
          if (
            !(await this.invitationOwnsIdentity(tx, user.id, invitation.id))
          ) {
            throw new ForbiddenException(
              'This account is not activated yet. Activate it with your own invitation, then log in to accept.',
            );
          }
          if (!dto.password || !dto.firstName || !dto.lastName) {
            throw new BadRequestException(
              'Password, first name, and last name are required for new accounts.',
            );
          }
          if (Buffer.byteLength(dto.password, 'utf8') > 72) {
            throw new BadRequestException(
              'Password must not exceed 72 UTF-8 bytes',
            );
          }
          passwordHash = await bcrypt.hash(dto.password, 12);
          firstName = dto.firstName;
          lastName = dto.lastName;
        } else {
          throw invalidClinic();
        }

        const now = new Date();
        const claim = await tx.accountInvitation.updateMany({
          where: {
            id: invitation.id,
            tokenHash,
            purpose: CLINIC_MEMBERSHIP_PURPOSE,
            consumedAt: null,
            revokedAt: null,
            expiresAt: { gt: now },
          },
          data: { consumedAt: now },
        });
        if (claim.count !== 1) throw invalidClinic();

        if (user.status === 'PENDING') {
          await tx.user.update({
            where: { id: user.id },
            data: {
              status: 'ACTIVE',
              password_hash: passwordHash,
              firstName,
              lastName,
            },
          });
        }

        const existingMembership = await tx.organizationMembership.findUnique({
          where: {
            userId_organizationId: {
              userId: user.id,
              organizationId: invitation.organizationId!,
            },
          },
        });

        if (!existingMembership) {
          await tx.organizationMembership.create({
            data: {
              userId: user.id,
              organizationId: invitation.organizationId!,
              roleId: invitation.roleId!,
              // The issuer's invitation is the approval; login only uses ACTIVE memberships.
              status: 'ACTIVE',
            },
          });
        }

        await tx.accountActivationEvent.create({
          data: {
            userId: user.id,
            invitationId: invitation.id,
            action: 'ACCEPTED',
            actor: authenticatedUserId || 'invited-user',
          },
        });

        return {
          message: 'Clinic invitation accepted.',
          organizationId: invitation.organizationId,
        };
      });
    });
  }

  /** True when an invitation of this clinic created the (still PENDING) identity. */
  private async identityCreatedByClinic(
    tx: Prisma.TransactionClient,
    userId: string,
    organizationId: string,
  ) {
    const created = await tx.accountActivationEvent.findMany({
      where: { userId, action: IDENTITY_CREATED },
      select: { invitationId: true },
    });
    if (!created.length) return false;
    const owning = await tx.accountInvitation.count({
      where: {
        id: { in: created.map((event) => event.invitationId) },
        organizationId,
        purpose: CLINIC_MEMBERSHIP_PURPOSE,
      },
    });
    return owning > 0;
  }

  private async invitationOwnsIdentity(
    tx: Prisma.TransactionClient,
    userId: string,
    invitationId: string,
  ) {
    const event = await tx.accountActivationEvent.findFirst({
      where: { userId, invitationId, action: IDENTITY_CREATED },
      select: { id: true },
    });
    return event !== null;
  }
}
