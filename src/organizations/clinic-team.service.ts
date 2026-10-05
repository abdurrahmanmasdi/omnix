import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  MEMBERSHIP_GRANTS_INCLUDE,
  membershipHasPermission,
} from '../auth/permission.service';

@Injectable()
export class ClinicTeamService {
  constructor(private readonly prisma: PrismaService) {}
  async members(organizationId: string) {
    const rows = await this.prisma.organizationMembership.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        role: { select: { name: true } },
      },
    });
    return rows.map((m) => ({
      id: m.id,
      userId: m.user.id,
      firstName: m.user.firstName,
      lastName: m.user.lastName,
      email: m.user.email,
      roleId: m.roleId,
      roleName: m.role.name,
      status: m.status,
      joinedAt: m.createdAt,
    }));
  }
  async invitations(organizationId: string) {
    const rows = await this.prisma.accountInvitation.findMany({
      where: {
        organizationId,
        purpose: 'CLINIC_MEMBERSHIP',
        consumedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { email: true } },
        role: { select: { name: true } },
      },
    });
    const issuers = await this.prisma.organizationMembership.findMany({
      where: {
        organizationId,
        userId: { in: [...new Set(rows.map((r) => r.issuedBy))] },
      },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    return rows.map((row) => {
      const issuer = issuers.find((m) => m.userId === row.issuedBy);
      return {
        id: row.id,
        email: row.user.email,
        roleName: row.role?.name ?? '',
        issuer: issuer
          ? `${issuer.user.firstName} ${issuer.user.lastName}`.trim()
          : row.issuedBy,
        expiresAt: row.expiresAt,
      };
    });
  }
  async roles(userId: string, organizationId: string) {
    const member = await this.prisma.organizationMembership.findFirst({
      where: { userId, organizationId, status: 'ACTIVE', deletedAt: null },
      include: MEMBERSHIP_GRANTS_INCLUDE,
    });
    if (!member) return [];
    const roles = await this.prisma.role.findMany({
      where: { organizationId, deletedAt: null },
      include: { rolePermissions: { include: { permission: true } } },
      orderBy: { name: 'asc' },
    });
    return roles
      .filter((role) =>
        role.rolePermissions.every((grant) =>
          membershipHasPermission(member, grant.permission.action),
        ),
      )
      .map((role) => ({ id: role.id, name: role.name }));
  }
  async changeMember(
    organizationId: string,
    membershipId: string,
    actor: string,
    roleId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Serialize team mutations on the clinic row, including last-owner checks.
      await tx.organization.update({
        where: { id: organizationId },
        data: { updatedAt: new Date() },
      });
      const issuer = await tx.organizationMembership.findFirst({
        where: {
          organizationId,
          userId: actor,
          status: 'ACTIVE',
          deletedAt: null,
        },
        include: MEMBERSHIP_GRANTS_INCLUDE,
      });
      if (!issuer || !membershipHasPermission(issuer, 'organization:manage'))
        throw new ForbiddenException({ code: 'TEAM_PERMISSION_REQUIRED' });
      const target = await tx.organizationMembership.findFirst({
        where: { id: membershipId, organizationId, deletedAt: null },
        include: {
          role: true,
          user: { select: { status: true, deletedAt: true } },
        },
      });
      if (!target)
        throw new NotFoundException({ code: 'TEAM_MEMBER_NOT_FOUND' });
      if (target.userId === actor)
        throw new ConflictException({ code: 'TEAM_SELF_CHANGE_FORBIDDEN' });
      if (roleId) {
        const role = await tx.role.findFirst({
          where: { id: roleId, organizationId, deletedAt: null },
          include: { rolePermissions: { include: { permission: true } } },
        });
        if (!role) throw new NotFoundException({ code: 'TEAM_ROLE_NOT_FOUND' });
        if (
          !role.rolePermissions.every((g) =>
            membershipHasPermission(issuer, g.permission.action),
          )
        )
          throw new ForbiddenException({
            code: 'INVITATION_ROLE_EXCEEDS_ISSUER',
          });
        if (roleId === target.roleId) return { changed: false };
      }
      if (
        target.status === 'ACTIVE' &&
        target.role.name === 'Super Admin' &&
        target.user.status === 'ACTIVE' &&
        !target.user.deletedAt
      ) {
        const remaining = await tx.organizationMembership.count({
          where: {
            organizationId,
            id: { not: target.id },
            status: 'ACTIVE',
            deletedAt: null,
            role: { name: 'Super Admin', deletedAt: null },
            user: { status: 'ACTIVE', deletedAt: null },
          },
        });
        if (!remaining)
          throw new ConflictException({ code: 'TEAM_LAST_OWNER_REQUIRED' });
      }
      await tx.organizationMembership.update({
        where: { id: target.id, organizationId },
        data: roleId ? { roleId } : { deletedAt: new Date() },
      });
      await tx.user.update({
        where: { id: target.userId },
        data: { securityVersion: { increment: 1 } },
      });
      await tx.session.updateMany({
        where: { userId: target.userId, isRevoked: false },
        data: {
          isRevoked: true,
          revokedAt: new Date(),
          revokedReason: 'membership_changed',
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actor,
          targetId: target.id,
          action: roleId ? 'membership.role_changed' : 'membership.removed',
          metadata: { oldRoleId: target.roleId, newRoleId: roleId ?? null },
        },
      });
      return { changed: true };
    });
  }
  async revoke(organizationId: string, invitationId: string, actor: string) {
    return this.prisma.$transaction(async (tx) => {
      const invitation = await tx.accountInvitation.findFirst({
        where: {
          id: invitationId,
          organizationId,
          purpose: 'CLINIC_MEMBERSHIP',
        },
      });
      if (!invitation)
        throw new NotFoundException({
          code: 'CLINIC_INVITATION_NOT_FOUND',
          message: 'Invitation not found',
        });
      const changed = await tx.accountInvitation.updateMany({
        where: {
          id: invitationId,
          organizationId,
          purpose: 'CLINIC_MEMBERSHIP',
          consumedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      if (!changed.count)
        throw new ConflictException({
          code: 'CLINIC_INVITATION_NOT_PENDING',
          message: 'Invitation is no longer pending',
        });
      await tx.accountActivationEvent.create({
        data: {
          userId: invitation.userId,
          invitationId,
          action: 'REVOKED',
          actor,
        },
      });
      return { revoked: true };
    });
  }
}
