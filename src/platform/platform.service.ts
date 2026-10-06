import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { tenantStorage } from '../core/tenant/tenant.context';
import { InvitationsService } from '../auth/invitations.service';
import { AuthService } from '../auth/auth.service';
@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invitations: InvitationsService,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}
  private system<T>(fn: () => Promise<T>) {
    return tenantStorage.run({ isSystemBypass: true }, fn);
  }
  private link(path: string, token: string) {
    // Use configured frontend origin, never caller-controlled redirects or request headers.
    const origin = (
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3001'
    )
      .split(',')[0]
      .trim();
    const link = new URL(path, origin);
    link.hash = new URLSearchParams({ token }).toString();
    return link.toString();
  }
  clinics(actor: string) {
    return this.system(() =>
      this.prisma.$transaction(async (tx) => {
        const clinics = await tx.organization.findMany({
          select: {
            id: true,
            name: true,
            createdAt: true,
            isActive: true,
            deleted_at: true,
            memberships: {
              where: {
                deletedAt: null,
                status: 'ACTIVE',
                user: { deletedAt: null, status: 'ACTIVE' },
              },
              select: {
                user: { select: { email: true } },
                role: { select: { name: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        });
        await tx.auditLog.create({
          data: { action: 'PLATFORM_CLINICS_LISTED', actor },
        });
        return clinics.map((c) => ({
          id: c.id,
          name: c.name,
          createdAt: c.createdAt,
          isActive: c.isActive && !c.deleted_at,
          memberCount: c.memberships.length,
          ownerEmails: c.memberships
            .filter((m) => m.role.name === 'Super Admin')
            .map((m) => m.user.email),
        }));
      }),
    );
  }
  pending(actor: string) {
    return this.system(() =>
      this.prisma.$transaction(async (tx) => {
        const rows = await tx.accountInvitation.findMany({
          where: {
            purpose: 'PILOT_ACTIVATION',
            consumedAt: null,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          select: {
            id: true,
            issuedBy: true,
            expiresAt: true,
            user: { select: { email: true } },
          },
          orderBy: { createdAt: 'desc' },
        });
        await tx.auditLog.create({
          data: { action: 'PLATFORM_INVITATIONS_LISTED', actor },
        });
        return rows.map((r) => ({
          id: r.id,
          email: r.user.email,
          issuer: r.issuedBy,
          expiresAt: r.expiresAt,
        }));
      }),
    );
  }
  async invite(email: string, actor: string) {
    const issued = await this.invitations.issue(email, actor);
    return {
      invitationId: issued.invitationId,
      link: this.link('/accept-invitation', issued.token),
      expiresAt: issued.expiresAt,
    };
  }
  revoke(id: string, actor: string) {
    return this.invitations.revoke(id, actor);
  }
  async recovery(email: string, actor: string) {
    const issued = await this.auth.issueRecovery(email, actor);
    return {
      invitationId: issued.invitationId,
      link: this.link('/recover', issued.token),
      expiresAt: issued.expiresAt,
    };
  }
}
