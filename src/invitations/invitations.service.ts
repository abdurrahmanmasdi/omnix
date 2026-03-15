import {
  Injectable,
  ForbiddenException,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class InvitationsService {
  constructor(private prisma: PrismaService) {}

  async createInvite(
    requesterId: string,
    email: string,
    organizationId: string,
    role: Role,
  ) {
    // 1. Verify the requester has permission (Must be an OWNER or ADMIN)
    const membership = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: organizationId,
          userId: requesterId,
        },
      },
    });

    if (
      !membership ||
      (membership.role !== 'OWNER' && membership.role !== 'ADMIN')
    ) {
      throw new ForbiddenException(
        'You do not have permission to invite users to this organization',
      );
    }

    // 2. Check if the user is already a member
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      const alreadyMember = await this.prisma.organizationMember.findUnique({
        where: {
          organizationId_userId: { organizationId, userId: existingUser.id },
        },
      });
      if (alreadyMember)
        throw new ConflictException('User is already a member');
    }

    // 3. Create the invitation (Expires in 7 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Wait for the database to create the record so we can access the generated token
    const newInvitation = await this.prisma.invitation.create({
      data: {
        email,
        organizationId,
        role,
        expiresAt,
      },
    });

    // 4. Construct the manual link (Assuming Next.js will run on port 3001 or similar later)
    // The user will copy this and send it via Slack/WhatsApp/etc.
    const inviteLink = `http://localhost:3000/join?token=${newInvitation.token}`;

    return {
      message: 'Invitation generated successfully. Send this link to the user.',
      inviteLink,
      role: newInvitation.role,
      expiresAt: newInvitation.expiresAt,
    };
  }

  async acceptInvite(userId: string, userEmail: string, token: string) {
    // 1. Find the invitation by its unique token
    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
    });

    if (!invitation) {
      throw new NotFoundException('Invalid invitation token');
    }

    // 2. Check if the invitation has expired
    if (invitation.expiresAt < new Date()) {
      // Optional: automatically clean up the expired token
      await this.prisma.invitation.delete({ where: { id: invitation.id } });
      throw new BadRequestException('This invitation has expired');
    }

    // 3. Security: Ensure the logged-in user's email matches the invite
    // This prevents someone from forwarding an invite link to a stranger
    if (invitation.email !== userEmail) {
      throw new ForbiddenException(
        'This invitation was sent to a different email address',
      );
    }

    // 4. Check if the user is somehow already in the organization
    const existingMember = await this.prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: invitation.organizationId,
          userId: userId,
        },
      },
    });

    if (existingMember) {
      throw new ConflictException(
        'You are already a member of this organization',
      );
    }

    // 5. The Transaction: Add the user AND delete the invitation simultaneously
    await this.prisma.$transaction([
      this.prisma.organizationMember.create({
        data: {
          organizationId: invitation.organizationId,
          userId: userId,
          role: invitation.role,
        },
      }),
      this.prisma.invitation.delete({
        where: { id: invitation.id },
      }),
    ]);

    return { message: 'Successfully joined the organization' };
  }
}
