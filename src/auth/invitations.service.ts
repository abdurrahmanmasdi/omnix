import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { isEmail } from 'class-validator';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';

const PURPOSE = 'PILOT_ACTIVATION';
const digest = (token: string) =>
  createHash('sha256').update(`${PURPOSE}:${token}`).digest('hex');
const invalid = () =>
  new UnauthorizedException(
    'Invitation is invalid, expired, or already used. Request a new invitation from your pilot contact.',
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
    return this.prisma.$transaction(async (tx) => {
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
          tokenHash: digest(token),
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
    });
  }

  async revoke(invitationId: string, operator: string) {
    if (!operator.trim() || operator.length > 120)
      throw new BadRequestException('INVITATION_INPUT_INVALID');
    return this.prisma.$transaction(async (tx) => {
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
    });
  }

  async accept(dto: AcceptInvitationDto) {
    if (!/^[a-f0-9]{64}$/.test(dto.token)) throw invalid();
    if (Buffer.byteLength(dto.password, 'utf8') > 72)
      throw new BadRequestException('Password must not exceed 72 UTF-8 bytes');
    const tokenHash = digest(dto.token);
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
      if (!user || user.status !== 'PENDING' || user.deletedAt) throw invalid();
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
  }
}
